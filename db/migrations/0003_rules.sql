-- Business rules enforced in the database: integrity triggers and SECURITY DEFINER operations.

-- Test hook: server code never sets app.fake_now in production; tests use it to make time deterministic.
create or replace function app.clock() returns timestamptz language sql stable as $$
  select coalesce(nullif(current_setting('app.fake_now', true), '')::timestamptz, now())
$$;

create or replace function app.office_today(o uuid) returns date
language sql stable security definer set search_path = public, pg_temp as $$
  select (app.clock() at time zone (select timezone from offices where id = o))::date
$$;

-- ---------------------------------------------------------------- cross-office reference protection
-- Usage: execute function app.check_office_refs('col:table', ...)   ('members' = must be a member of the office)
create or replace function app.check_office_refs() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare i integer; col text; tbl text; v uuid; ok boolean; j jsonb := to_jsonb(new);
begin
  for i in 0 .. tg_nargs - 1 loop
    col := split_part(tg_argv[i], ':', 1);
    tbl := split_part(tg_argv[i], ':', 2);
    v := (j ->> col)::uuid;
    continue when v is null;
    if tbl = 'members' then
      select exists (select 1 from memberships where user_id = v and office_id = new.office_id) into ok;
    else
      execute format('select exists (select 1 from %I where id = $1 and office_id = $2)', tbl) into ok using v, new.office_id;
    end if;
    if not ok then
      raise exception 'Referenced % does not belong to this office', replace(col, '_id', '') using errcode = '23503';
    end if;
  end loop;
  return new;
end $$;

create trigger memberships_refs before insert or update on memberships for each row execute function app.check_office_refs('team_id:teams');
create trigger member_levels_refs before insert on member_levels for each row execute function app.check_office_refs('user_id:members', 'level_id:levels');
create trigger attendance_refs before insert or update on attendance_records for each row execute function app.check_office_refs('user_id:members');
create trigger prospects_refs before insert or update on prospects for each row execute function app.check_office_refs('owner_id:members');
create trigger tasks_refs before insert or update on tasks for each row execute function app.check_office_refs('assignee_id:members');
create trigger goals_refs before insert or update on goals for each row execute function app.check_office_refs('user_id:members', 'team_id:teams', 'responsible_user_id:members');
create trigger challenge_participants_refs before insert on challenge_participants for each row execute function app.check_office_refs('team_id:teams');
create trigger personal_transactions_refs before insert or update on personal_transactions for each row execute function app.check_office_refs('category_id:finance_categories');
create trigger expenses_refs before insert or update on expenses for each row execute function app.check_office_refs('category_id:finance_categories', 'responsible_user_id:members', 'paid_account_id:office_accounts', 'attachment_id:attachments');
create trigger fines_refs before insert or update on fines for each row execute function app.check_office_refs('user_id:members', 'category_id:fine_categories', 'attendance_record_id:attendance_records');
create trigger office_transactions_refs before insert on office_transactions for each row execute function app.check_office_refs('account_id:office_accounts', 'to_account_id:office_accounts', 'category_id:finance_categories', 'expense_id:expenses', 'fine_payment_id:fine_payments');
create trigger budgets_refs before insert or update on budgets for each row execute function app.check_office_refs('category_id:finance_categories');
create trigger plan_activities_refs before insert or update on plan_activities for each row execute function app.check_office_refs('plan_id:office_plans');

-- ---------------------------------------------------------------- memberships: never remove the last administrator
create or replace function app.memberships_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.role = 'admin' and old.status = 'active' and (new.role <> 'admin' or new.status <> 'active') then
    if not exists (select 1 from memberships m where m.office_id = old.office_id and m.id <> old.id and m.role = 'admin' and m.status = 'active') then
      raise exception 'An office must keep at least one active administrator' using errcode = 'P0001';
    end if;
  end if;
  if new.status = 'inactive' and old.status = 'active' then
    new.deactivated_at := now();
    delete from sessions where user_id = new.user_id and office_id = new.office_id;
  elsif new.status = 'active' then
    new.deactivated_at := null;
  end if;
  return new;
end $$;
create trigger memberships_guard before update on memberships for each row execute function app.memberships_guard();

-- ---------------------------------------------------------------- attendance: self check-in (only path for members)
create or replace function app.self_check_in(p_note text default null) returns attendance_records
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  o uuid := app.office();
  s office_settings%rowtype;
  tz text;
  local_ts timestamp;
  d date;
  t time;
  st text;
  r attendance_records%rowtype;
begin
  if app.uid() is null or not app.has_membership(o) then
    raise exception 'You must be an active member of this office to check in' using errcode = '42501';
  end if;
  select * into s from office_settings where office_id = o;
  select timezone into tz from offices where id = o;
  local_ts := app.clock() at time zone tz;
  d := local_ts::date;
  t := local_ts::time;
  if not (extract(isodow from d)::smallint = any (s.working_days)) then
    raise exception 'Today is not a working day for this office' using errcode = 'P0001';
  end if;
  if t < s.checkin_opens then
    raise exception 'Check-in opens at %', to_char(s.checkin_opens, 'HH24:MI') using errcode = 'P0001';
  end if;
  if t > s.checkin_closes then
    raise exception 'Check-in closed at %. Ask an administrator to record your attendance.', to_char(s.checkin_closes, 'HH24:MI') using errcode = 'P0001';
  end if;
  st := case when t > s.late_after then 'late' else 'present' end;
  insert into attendance_records (office_id, user_id, att_date, status, check_in_at, source, note)
    values (o, app.uid(), d, st, app.clock(), 'self', nullif(trim(p_note), ''))
    on conflict (office_id, user_id, att_date) do nothing
    returning * into r;
  if r.id is null then
    raise exception 'Attendance has already been recorded for you today' using errcode = 'P0001';
  end if;
  return r;
end $$;

-- ---------------------------------------------------------------- tasks
create or replace function app.tasks_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and not app.is_admin(old.office_id) and old.kind = 'assigned' then
    if (new.title, new.description, new.assignee_id, new.created_by, new.start_date, new.due_date, new.priority, new.kind, new.batch_id)
       is distinct from (old.title, old.description, old.assignee_id, old.created_by, old.start_date, old.due_date, old.priority, old.kind, old.batch_id) then
      raise exception 'Only status and progress of assigned tasks can be updated by members' using errcode = '42501';
    end if;
    if new.status = 'cancelled' and old.status <> 'cancelled' then
      raise exception 'Only an administrator can cancel an assigned task' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'UPDATE' and (new.assignee_id <> old.assignee_id or new.created_by <> old.created_by) and old.kind = 'personal' then
    raise exception 'Personal tasks cannot be reassigned' using errcode = 'P0001';
  end if;
  if new.status = 'completed' then
    new.progress := 100;
    if tg_op = 'INSERT' or old.status <> 'completed' then new.completed_at := app.clock(); end if;
  else
    new.completed_at := null;
  end if;
  return new;
end $$;
create trigger tasks_guard before insert or update on tasks for each row execute function app.tasks_guard();

-- ---------------------------------------------------------------- activity registrations
create or replace function app.registrations_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare cap integer; taken integer; is_adm boolean := app.is_admin(new.office_id);
begin
  if not is_adm and new.status not in ('registered', 'cancelled') then
    raise exception 'Only an administrator can record participation' using errcode = '42501';
  end if;
  if not is_adm and tg_op = 'UPDATE' and old.status in ('attended', 'absent') then
    raise exception 'Participation has already been recorded for this activity' using errcode = 'P0001';
  end if;
  if new.status = 'registered' and (tg_op = 'INSERT' or old.status <> 'registered') then
    select a.capacity into cap from plan_activities a where a.id = new.activity_id for update;
    if cap is not null then
      select count(*) into taken from activity_registrations r
        where r.activity_id = new.activity_id and r.status in ('registered', 'attended') and r.id <> new.id;
      if taken >= cap then
        raise exception 'This activity is full' using errcode = 'P0001';
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger registrations_guard before insert or update on activity_registrations for each row execute function app.registrations_guard();

create or replace function app.activity_registration_counts(p_plan uuid)
returns table (activity_id uuid, registered bigint, attended bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  select a.id, count(r.*) filter (where r.status in ('registered', 'attended')), count(r.*) filter (where r.status = 'attended')
  from plan_activities a
  join office_plans p on p.id = a.plan_id
  left join activity_registrations r on r.activity_id = a.id
  where a.plan_id = p_plan and app.is_member(a.office_id) and (p.status = 'published' or app.is_admin(a.office_id))
  group by a.id
$$;

-- ---------------------------------------------------------------- personal transactions
create or replace function app.personal_txn_guard() returns trigger language plpgsql as $$
declare o personal_transactions%rowtype;
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from personal_accounts a where a.id = new.account_id and a.user_id = new.user_id and a.office_id = new.office_id and not a.archived)
       or (new.to_account_id is not null and not exists (
         select 1 from personal_accounts a where a.id = new.to_account_id and a.user_id = new.user_id and a.office_id = new.office_id and not a.archived)) then
      raise exception 'Choose one of your own active accounts' using errcode = '42501';
    end if;
    if new.reverses_id is not null then
      select * into o from personal_transactions where id = new.reverses_id for update;
      if not found or o.user_id <> new.user_id or o.reverses_id is not null or o.status = 'rejected'
         or (o.type, o.amount, o.account_id, o.to_account_id) is distinct from (new.type, new.amount, new.account_id, new.to_account_id)
         or new.direction <> -o.direction then
        raise exception 'Invalid correction entry' using errcode = 'P0001';
      end if;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status in ('approved', 'pending') then
      raise exception 'Approved or submitted transactions cannot be deleted. Withdraw the submission or record a correction.' using errcode = 'P0001';
    end if;
    if old.reverses_id is not null or exists (select 1 from personal_transactions r where r.reverses_id = old.id) then
      raise exception 'Corrected transactions are part of the audit trail and cannot be deleted' using errcode = 'P0001';
    end if;
    return old;
  end if;

  -- UPDATE
  if old.status = 'approved' then
    raise exception 'Approved transactions are locked. Record a correction instead.' using errcode = 'P0001';
  end if;
  if old.reverses_id is not null or exists (select 1 from personal_transactions r where r.reverses_id = old.id) then
    raise exception 'Corrected transactions cannot be edited' using errcode = 'P0001';
  end if;
  if (new.user_id, new.office_id, new.client_token, new.reverses_id) is distinct from (old.user_id, old.office_id, old.client_token, old.reverses_id) then
    raise exception 'Immutable transaction fields cannot be changed' using errcode = '42501';
  end if;
  if old.user_id = app.uid() then
    if new.status not in ('recorded', 'pending') then
      raise exception 'You cannot approve or reject your own transactions' using errcode = '42501';
    end if;
    new.reviewed_by := null; new.reviewed_at := null;
    if not exists (select 1 from personal_accounts a where a.id = new.account_id and a.user_id = new.user_id)
       or (new.to_account_id is not null and not exists (select 1 from personal_accounts a where a.id = new.to_account_id and a.user_id = new.user_id)) then
      raise exception 'Choose one of your own accounts' using errcode = '42501';
    end if;
  else
    if not app.is_admin(old.office_id) or old.status <> 'pending' or new.status not in ('approved', 'rejected') then
      raise exception 'Only pending submissions can be reviewed by an administrator' using errcode = '42501';
    end if;
    if (new.account_id, new.to_account_id, new.type, new.amount, new.direction, new.category_id, new.txn_date, new.description, new.notes)
       is distinct from (old.account_id, old.to_account_id, old.type, old.amount, old.direction, old.category_id, old.txn_date, old.description, old.notes) then
      raise exception 'Reviewers cannot change transaction details' using errcode = '42501';
    end if;
    new.reviewed_by := app.uid();
    new.reviewed_at := now();
  end if;
  return new;
end $$;
create trigger personal_txn_guard before insert or update or delete on personal_transactions for each row execute function app.personal_txn_guard();

-- ---------------------------------------------------------------- office transactions (append-only)
create or replace function app.office_txn_guard() returns trigger language plpgsql as $$
declare o office_transactions%rowtype;
begin
  if new.reverses_id is not null then
    select * into o from office_transactions where id = new.reverses_id;
    if not found or o.office_id <> new.office_id or o.reverses_id is not null
       or (o.type, o.amount, o.account_id, o.to_account_id) is distinct from (new.type, new.amount, new.account_id, new.to_account_id)
       or new.direction <> -o.direction then
      raise exception 'Invalid reversal entry' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger office_txn_guard before insert on office_transactions for each row execute function app.office_txn_guard();

-- ---------------------------------------------------------------- expenses workflow
create or replace function app.expenses_guard() returns trigger language plpgsql as $$
declare is_adm boolean := app.is_admin(coalesce(new.office_id, old.office_id));
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending' then new.submitted_at := now(); end if;
    return new;
  end if;
  if old.status = 'paid' then
    raise exception 'Paid expenses are final' using errcode = 'P0001';
  end if;
  if new.status = 'paid' and new.paid_account_id is null then
    raise exception 'Choose the office account the expense was paid from' using errcode = 'P0001';
  end if;
  if new.submitted_by <> old.submitted_by then
    raise exception 'The submitter cannot be changed' using errcode = '42501';
  end if;
  if new.status <> old.status and not (
       (old.status = 'draft' and new.status = 'pending')
    or (old.status = 'pending' and new.status = 'draft')
    or (old.status = 'rejected' and new.status in ('draft', 'pending'))
    or (is_adm and old.status = 'pending' and new.status in ('approved', 'rejected'))
    or (is_adm and old.status = 'approved' and new.status in ('paid', 'rejected'))
  ) then
    raise exception 'Cannot move an expense from % to %', old.status, new.status using errcode = 'P0001';
  end if;
  if not is_adm then
    if old.status not in ('draft', 'rejected', 'pending') then
      raise exception 'This expense is locked for review' using errcode = 'P0001';
    end if;
    if old.status = 'pending' and new.status = 'pending' then
      raise exception 'Withdraw the submission before editing it' using errcode = 'P0001';
    end if;
  end if;
  if new.status = 'pending' and old.status <> 'pending' then new.submitted_at := now(); end if;
  return new;
end $$;
create trigger expenses_guard before insert or update on expenses for each row execute function app.expenses_guard();

-- ---------------------------------------------------------------- fines
create or replace function app.fine_paid_total(p_fine uuid) returns numeric
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(sum(amount), 0) from fine_payments where fine_id = p_fine and status = 'confirmed'
$$;

create or replace function app.refresh_fine_status(p_fine uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare f fines%rowtype; paid numeric; s text;
begin
  select * into f from fines where id = p_fine;
  if not found or f.status = 'waived' then return; end if;
  paid := app.fine_paid_total(p_fine);
  s := case
    when paid >= f.amount then 'paid'
    when exists (select 1 from fine_disputes d where d.fine_id = p_fine and d.status = 'open') then 'disputed'
    when paid > 0 then 'partially_paid'
    else 'pending' end;
  update fines set status = s where id = p_fine and status is distinct from s;
end $$;

create or replace function app.fines_guard() returns trigger language plpgsql as $$
declare paid numeric;
begin
  if tg_op = 'UPDATE' then
    if old.status = 'waived' and new.status <> 'waived' then
      raise exception 'Waived fines cannot be reinstated; issue a new fine instead' using errcode = 'P0001';
    end if;
    if new.user_id <> old.user_id or new.issued_by <> old.issued_by then
      raise exception 'The fined member and issuer cannot be changed' using errcode = 'P0001';
    end if;
    if new.amount <> old.amount then
      paid := app.fine_paid_total(old.id);
      if new.amount < paid then
        raise exception 'Amount cannot be lower than the % already paid', paid using errcode = 'P0001';
      end if;
    end if;
    if new.status = 'waived' and old.status <> 'waived' then
      new.waived_at := now();
    end if;
  end if;
  return new;
end $$;
create trigger fines_guard before update on fines for each row execute function app.fines_guard();

create or replace function app.fines_after() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if pg_trigger_depth() < 3 then perform app.refresh_fine_status(new.id); end if;
  return null;
end $$;
create trigger fines_after after update of amount on fines for each row execute function app.fines_after();

create or replace function app.fine_payments_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare f fines%rowtype; paid numeric;
begin
  select * into f from fines where id = new.fine_id for update; -- serialises concurrent payments for the same fine
  if not found or f.user_id <> new.user_id or f.office_id <> new.office_id then
    raise exception 'Payment does not match the fine' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and old.status = 'rejected' and new.status <> 'rejected' then
    raise exception 'Rejected payment records are final' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and (new.amount, new.fine_id, new.user_id) is distinct from (old.amount, old.fine_id, old.user_id) then
    raise exception 'Payment details cannot be changed after submission' using errcode = 'P0001';
  end if;
  if new.status in ('pending', 'confirmed') and (tg_op = 'INSERT' or old.status <> new.status) then
    if f.status = 'waived' then
      raise exception 'This fine has been waived' using errcode = 'P0001';
    end if;
    paid := coalesce((select sum(amount) from fine_payments where fine_id = f.id and status = 'confirmed' and id <> new.id), 0);
    if paid + new.amount > f.amount then
      raise exception 'Payment of % exceeds the outstanding balance of %', new.amount, f.amount - paid using errcode = 'P0001';
    end if;
  end if;
  if new.status = 'confirmed' and (tg_op = 'INSERT' or old.status <> 'confirmed') then
    new.confirmed_by := app.uid();
    new.confirmed_at := now();
  end if;
  return new;
end $$;
create trigger fine_payments_guard before insert or update on fine_payments for each row execute function app.fine_payments_guard();

create or replace function app.fine_children_after() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform app.refresh_fine_status(new.fine_id);
  return null;
end $$;
create trigger fine_payments_after after insert or update on fine_payments for each row execute function app.fine_children_after();
create trigger fine_disputes_after after insert or update on fine_disputes for each row execute function app.fine_children_after();

-- ---------------------------------------------------------------- challenge scoring (raw scores; ranking/tie-breaks in src/lib/logic/challenges.ts)
-- Verified data only: manual submissions must be approved when verification is required; income counts only approved
-- personal transactions when verification is required; tasks count only admin-assigned tasks.
create or replace function app.challenge_scores(p_challenge uuid)
returns table (user_id uuid, full_name text, team_id uuid, team_name text, score numeric, last_activity_at timestamptz, joined_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare c challenges%rowtype; tz text; show_all boolean;
begin
  select * into c from challenges where id = p_challenge;
  if not found or not app.is_member(c.office_id) or (c.status = 'draft' and not app.is_admin(c.office_id)) then
    return;
  end if;
  select o.timezone into tz from offices o where o.id = c.office_id;
  show_all := c.leaderboard_enabled or app.is_admin(c.office_id);
  return query
  select p.user_id, u.full_name, p.team_id, t.name, coalesce(x.score, 0)::numeric, x.last_at, p.joined_at
  from challenge_participants p
  join users u on u.id = p.user_id
  left join teams t on t.id = p.team_id
  left join lateral (
    select sum(v.val) as score, max(v.at) as last_at from (
      select s.value as val, s.created_at as at from challenge_submissions s
        where c.metric = 'manual' and s.challenge_id = c.id and s.user_id = p.user_id
          and (s.status = 'approved' or (not c.requires_verification and s.status = 'pending'))
          and s.occurred_on between c.start_date and c.end_date
      union all
      select 1, pr.created_at from prospects pr
        where c.metric = 'prospects_added' and pr.office_id = c.office_id and pr.created_by = p.user_id
          and (pr.created_at at time zone tz)::date between c.start_date and c.end_date
      union all
      select 1, pr.converted_at from prospects pr
        where c.metric = 'prospects_converted' and pr.office_id = c.office_id and pr.owner_id = p.user_id and pr.stage = 'converted'
          and (pr.converted_at at time zone tz)::date between c.start_date and c.end_date
      union all
      select pt.direction * pt.amount, pt.created_at from personal_transactions pt
        where c.metric = 'personal_income' and pt.office_id = c.office_id and pt.user_id = p.user_id and pt.type = 'income'
          and (pt.status = 'approved' or (not c.requires_verification and pt.status in ('recorded', 'pending')))
          and pt.txn_date between c.start_date and c.end_date
      union all
      select 1, tk.completed_at from tasks tk
        where c.metric = 'tasks_completed' and tk.office_id = c.office_id and tk.assignee_id = p.user_id and tk.kind = 'assigned'
          and tk.status = 'completed' and (tk.completed_at at time zone tz)::date between c.start_date and c.end_date
      union all
      select 1, r.updated_at from activity_registrations r join plan_activities a on a.id = r.activity_id
        where c.metric = 'training_attended' and r.office_id = c.office_id and r.user_id = p.user_id and r.status = 'attended'
          and a.kind in ('training', 'workshop') and (a.starts_at at time zone tz)::date between c.start_date and c.end_date
      union all
      select 1, ar.check_in_at from attendance_records ar
        where c.metric = 'attendance_days' and ar.office_id = c.office_id and ar.user_id = p.user_id and ar.status in ('present', 'late')
          and ar.att_date between c.start_date and c.end_date
    ) v
  ) x on true
  where p.challenge_id = c.id and (show_all or p.user_id = app.uid());
end $$;

-- ---------------------------------------------------------------- goal metrics (automatic progress)
create or replace function app.goal_metric_value(p_goal uuid) returns numeric
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare g goals%rowtype; tz text; v numeric := 0; members uuid[]; min_rank integer;
begin
  select * into g from goals where id = p_goal;
  if not found or not app.is_member(g.office_id) then return null; end if;
  if g.scope = 'individual' and g.user_id <> app.uid() and not app.is_admin(g.office_id) then return null; end if;
  if g.metric is null then return g.current_value; end if;
  select timezone into tz from offices where id = g.office_id;
  members := case g.scope
    when 'individual' then array[g.user_id]
    when 'team' then array(select m.user_id from memberships m where m.office_id = g.office_id and m.team_id = g.team_id and m.status = 'active')
    else array(select m.user_id from memberships m where m.office_id = g.office_id)
  end;

  if g.metric = 'attendance_days' then
    select count(*) into v from attendance_records a where a.office_id = g.office_id and a.user_id = any (members)
      and a.status in ('present', 'late') and a.att_date between g.start_date and g.end_date;
  elsif g.metric = 'prospects_added' then
    select count(*) into v from prospects p where p.office_id = g.office_id and p.created_by = any (members)
      and (p.created_at at time zone tz)::date between g.start_date and g.end_date;
  elsif g.metric = 'prospects_converted' then
    select count(*) into v from prospects p where p.office_id = g.office_id and p.owner_id = any (members) and p.stage = 'converted'
      and (p.converted_at at time zone tz)::date between g.start_date and g.end_date;
  elsif g.metric = 'tasks_completed' then
    select count(*) into v from tasks t where t.office_id = g.office_id and t.assignee_id = any (members) and t.status = 'completed'
      and (t.completed_at at time zone tz)::date between g.start_date and g.end_date;
  elsif g.metric = 'personal_income' then
    select coalesce(sum(t.direction * t.amount), 0) into v from personal_transactions t where t.office_id = g.office_id
      and t.user_id = any (members) and t.type = 'income' and t.status <> 'rejected' and t.txn_date between g.start_date and g.end_date;
  elsif g.metric = 'office_income' then
    select coalesce(sum(t.direction * t.amount), 0) into v from office_transactions t where t.office_id = g.office_id
      and t.type = 'income' and t.txn_date between g.start_date and g.end_date;
  elsif g.metric = 'active_members' then
    select count(*) into v from memberships m where m.office_id = g.office_id and m.status = 'active' and m.user_id = any (members);
  elsif g.metric = 'training_attended' then
    select count(*) into v from activity_registrations r join plan_activities a on a.id = r.activity_id
      where r.office_id = g.office_id and r.user_id = any (members) and r.status = 'attended'
        and a.kind in ('training', 'workshop') and (a.starts_at at time zone tz)::date between g.start_date and g.end_date;
  elsif g.metric = 'members_at_level' then
    select l.rank into min_rank from levels l where l.id::text = g.metric_param and l.office_id = g.office_id;
    if min_rank is null then return 0; end if;
    select count(*) into v from memberships m
      where m.office_id = g.office_id and m.status = 'active' and m.user_id = any (members)
        and (select l.rank from member_levels ml join levels l on l.id = ml.level_id
             where ml.office_id = g.office_id and ml.user_id = m.user_id and ml.achieved_on <= g.end_date
             order by ml.achieved_on desc, ml.created_at desc limit 1) >= min_rank;
  elsif g.metric = 'challenge_score' then
    select coalesce(sum(s.score), 0) into v from app.challenge_scores(g.metric_param::uuid) s where s.user_id = any (members);
  end if;
  return coalesce(v, 0);
end $$;

-- ---------------------------------------------------------------- reminders (idempotent via notifications.dedupe_key)
create or replace function app.generate_reminders(p_office uuid, p_force boolean default false) returns integer
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  s office_settings%rowtype;
  tz text;
  today date;
  local_t time;
  n integer := 0;
  c integer;
begin
  if app.uid() is not null and not app.has_membership(p_office) and not app.is_super() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into s from office_settings where office_id = p_office for update skip locked;
  if not found then return 0; end if;
  if not p_force and s.reminders_last_run_at is not null and s.reminders_last_run_at > now() - interval '15 minutes' then
    return 0;
  end if;
  update office_settings set reminders_last_run_at = now() where office_id = p_office;
  select timezone into tz from offices where id = p_office;
  today := (app.clock() at time zone tz)::date;
  local_t := (app.clock() at time zone tz)::time;

  insert into notifications (office_id, user_id, kind, title, body, link, dedupe_key)
  select t.office_id, t.assignee_id, 'task_due',
         'Task due ' || case when t.due_date = today then 'today' else 'tomorrow' end, t.title, '/tasks',
         'task-due:' || t.id || ':' || t.due_date
  from tasks t join memberships m on m.office_id = t.office_id and m.user_id = t.assignee_id and m.status = 'active'
  where t.office_id = p_office and t.status in ('pending', 'in_progress') and t.due_date between today and today + 1
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics c = row_count; n := n + c;

  insert into notifications (office_id, user_id, kind, title, body, link, dedupe_key)
  select t.office_id, t.assignee_id, 'task_overdue', 'Task overdue', t.title || ' was due ' || to_char(t.due_date, 'DD Mon'), '/tasks',
         'task-overdue:' || t.id || ':' || t.due_date
  from tasks t join memberships m on m.office_id = t.office_id and m.user_id = t.assignee_id and m.status = 'active'
  where t.office_id = p_office and t.status in ('pending', 'in_progress') and t.due_date < today
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics c = row_count; n := n + c;

  insert into notifications (office_id, user_id, kind, title, body, link, dedupe_key)
  select p.office_id, p.owner_id, 'prospect_followup', 'Follow up with ' || p.name,
         coalesce(p.next_action, 'A follow-up is scheduled'), '/prospects?view=followups',
         'prospect-followup:' || p.id || ':' || p.next_follow_up
  from prospects p join memberships m on m.office_id = p.office_id and m.user_id = p.owner_id and m.status = 'active'
  where p.office_id = p_office and p.archived_at is null and p.next_follow_up <= today
    and p.stage not in ('converted', 'not_interested')
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics c = row_count; n := n + c;

  insert into notifications (office_id, user_id, kind, title, body, link, dedupe_key)
  select f.office_id, f.user_id, 'fine_due',
         case when f.due_date < today then 'Fine overdue' else 'Fine due ' || to_char(f.due_date, 'DD Mon') end,
         f.reason, '/fines', 'fine-due:' || f.id || ':' || case when f.due_date < today then 'overdue' else 'soon' end
  from fines f
  where f.office_id = p_office and f.status in ('pending', 'partially_paid') and f.due_date is not null and f.due_date <= today + 3
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics c = row_count; n := n + c;

  if s.attendance_reminders and extract(isodow from today)::smallint = any (s.working_days)
     and local_t between s.checkin_opens and s.late_after then
    insert into notifications (office_id, user_id, kind, title, body, link, dedupe_key)
    select m.office_id, m.user_id, 'attendance', 'Check in for today',
           'Check-in is open until ' || to_char(s.checkin_closes, 'HH24:MI') || ' (late after ' || to_char(s.late_after, 'HH24:MI') || ').',
           '/attendance', 'attendance:' || today
    from memberships m
    where m.office_id = p_office and m.status = 'active'
      and not exists (select 1 from attendance_records a where a.office_id = p_office and a.user_id = m.user_id and a.att_date = today)
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
    get diagnostics c = row_count; n := n + c;
  end if;

  return n;
end $$;

create or replace function app.generate_reminders_all() returns integer
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare o record; total integer := 0;
begin
  if app.uid() is not null then
    raise exception 'Only the scheduler may run reminders for all offices' using errcode = '42501';
  end if;
  for o in select id from offices loop
    total := total + app.generate_reminders(o.id, true);
  end loop;
  return total;
end $$;

-- ---------------------------------------------------------------- platform overview for super administrators
create or replace function app.platform_overview()
returns table (office_id uuid, name text, slug text, is_demo boolean, active_members bigint, admins bigint, created_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select o.id, o.name, o.slug, o.is_demo,
    (select count(*) from memberships m where m.office_id = o.id and m.status = 'active'),
    (select count(*) from memberships m where m.office_id = o.id and m.status = 'active' and m.role = 'admin'),
    o.created_at
  from offices o
  where app.is_super()
  order by o.created_at
$$;

grant execute on all functions in schema app to officehub_app;
