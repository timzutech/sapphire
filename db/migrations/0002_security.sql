-- Request context, authentication functions, Row Level Security and grants.
--
-- The application sets, per transaction:  set_config('app.user_id', <uuid>, true), set_config('app.office_id', <uuid>, true)
-- only after validating the session cookie through app.auth_session(). Roles are never taken from the client; they are
-- derived here from the memberships table.

create extension if not exists pgcrypto;

create or replace function app.uid() returns uuid language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

create or replace function app.office() returns uuid language sql stable as $$
  select nullif(current_setting('app.office_id', true), '')::uuid
$$;

create or replace function app.is_super() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select u.is_super_admin from users u where u.id = app.uid()), false)
$$;

-- Member of the *current* office (rows from other offices are never visible, even to multi-office users).
create or replace function app.is_member(o uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select o is not null and o = app.office() and (
    exists (select 1 from memberships m where m.office_id = o and m.user_id = app.uid() and m.status = 'active')
    or app.is_super()
  )
$$;

create or replace function app.is_admin(o uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select o is not null and o = app.office() and (
    exists (select 1 from memberships m where m.office_id = o and m.user_id = app.uid() and m.status = 'active' and m.role = 'admin')
    or app.is_super()
  )
$$;

create or replace function app.has_membership(o uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from memberships m where m.office_id = o and m.user_id = app.uid() and m.status = 'active')
$$;

create or replace function app.shares_office(target uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from memberships a join memberships b on a.office_id = b.office_id
    where a.user_id = app.uid() and b.user_id = target and a.office_id = app.office()
  )
$$;

create or replace function app.can_view_finances(o uuid, owner uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select app.is_member(o) and (
    owner = app.uid()
    or (app.is_admin(o) and coalesce((select s.admin_view_member_finances from office_settings s where s.office_id = o), false))
  )
$$;

-- ---------------------------------------------------------------- authentication (password hashes never leave the DB)
create or replace function app.hash_password(p text) returns text
language sql volatile set search_path = public, extensions, pg_temp as $$
  select crypt(p, gen_salt('bf', 10))
$$;

create or replace function app.auth_rate_check(p_key text, p_max integer, p_window_seconds integer) returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  delete from auth_attempts where created_at < now() - interval '1 day';
  select count(*) into n from auth_attempts where key = p_key and created_at > now() - make_interval(secs => p_window_seconds);
  if n >= p_max then
    return false;
  end if;
  insert into auth_attempts (key) values (p_key);
  return true;
end $$;

create or replace function app.auth_clear_attempts(p_key text) returns void
language sql volatile security definer set search_path = public, pg_temp as $$
  delete from auth_attempts where key = p_key
$$;

-- Verifies credentials and creates a session atomically. Returns null on failure (no detail about which part failed).
create or replace function app.auth_login(p_email text, p_password text, p_token_hash text, p_ttl_seconds integer, p_user_agent text)
returns uuid
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
declare u users%rowtype; v_office uuid;
begin
  select * into u from users where lower(email) = lower(trim(p_email));
  if not found then
    perform crypt(p_password, gen_salt('bf', 10)); -- equalise timing
    return null;
  end if;
  if u.password_hash <> crypt(p_password, u.password_hash) then
    return null;
  end if;
  select m.office_id into v_office from memberships m
    where m.user_id = u.id and m.status = 'active' order by (m.role = 'admin') desc, m.created_at limit 1;
  if v_office is null and not u.is_super_admin then
    return null; -- deactivated everywhere
  end if;
  if v_office is null then
    select id into v_office from offices order by created_at limit 1;
  end if;
  insert into sessions (user_id, office_id, token_hash, expires_at, user_agent)
    values (u.id, v_office, p_token_hash, now() + make_interval(secs => p_ttl_seconds), left(p_user_agent, 300));
  return u.id;
end $$;

create or replace function app.auth_session(p_token_hash text)
returns table (user_id uuid, office_id uuid, email text, full_name text, is_super_admin boolean, must_change_password boolean, role text)
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare s sessions%rowtype;
begin
  select * into s from sessions where token_hash = p_token_hash and expires_at > now();
  if not found then return; end if;
  if s.last_seen_at < now() - interval '5 minutes' then
    update sessions set last_seen_at = now() where id = s.id;
  end if;
  return query
    select u.id, s.office_id, u.email, u.full_name, u.is_super_admin, u.must_change_password,
      coalesce((select m.role from memberships m where m.user_id = u.id and m.office_id = s.office_id and m.status = 'active'),
               case when u.is_super_admin then 'admin' end)
    from users u
    where u.id = s.user_id
      and (u.is_super_admin or exists (select 1 from memberships m where m.user_id = u.id and m.office_id = s.office_id and m.status = 'active'));
end $$;

create or replace function app.auth_logout(p_token_hash text) returns void
language sql volatile security definer set search_path = public, pg_temp as $$
  delete from sessions where token_hash = p_token_hash
$$;

create or replace function app.auth_switch_office(p_token_hash text, p_office uuid) returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare s sessions%rowtype; ok boolean;
begin
  select * into s from sessions where token_hash = p_token_hash and expires_at > now();
  if not found then return false; end if;
  select exists (select 1 from memberships m where m.user_id = s.user_id and m.office_id = p_office and m.status = 'active')
      or exists (select 1 from users u where u.id = s.user_id and u.is_super_admin)
    into ok;
  if not ok then return false; end if;
  update sessions set office_id = p_office where id = s.id;
  return true;
end $$;

create or replace function app.change_own_password(p_current text, p_new text) returns boolean
language plpgsql volatile security definer set search_path = public, extensions, pg_temp as $$
declare u users%rowtype;
begin
  select * into u from users where id = app.uid();
  if not found or u.password_hash <> crypt(p_current, u.password_hash) then return false; end if;
  update users set password_hash = app.hash_password(p_new), must_change_password = false where id = u.id;
  delete from sessions where user_id = u.id and token_hash <> coalesce(current_setting('app.session_hash', true), '');
  return true;
end $$;

-- Admin account recovery: sets a temporary password and signs the member out everywhere.
create or replace function app.admin_reset_password(p_target uuid, p_new text) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  if not app.is_admin(app.office()) then
    raise exception 'Only office administrators can reset passwords' using errcode = '42501';
  end if;
  if not exists (select 1 from memberships m where m.user_id = p_target and m.office_id = app.office()) then
    raise exception 'User is not a member of this office' using errcode = '42501';
  end if;
  if exists (select 1 from users where id = p_target and is_super_admin) and not app.is_super() then
    raise exception 'Cannot reset a platform administrator password' using errcode = '42501';
  end if;
  update users set password_hash = app.hash_password(p_new), must_change_password = true where id = p_target;
  delete from sessions where user_id = p_target;
end $$;

-- Creates a login account (or returns the existing account for that email). Membership is created separately under RLS.
create or replace function app.create_user(p_email text, p_full_name text, p_phone text, p_password text, out user_id uuid, out existed boolean)
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  if not (app.is_admin(app.office()) or app.is_super()) then
    raise exception 'Not allowed to create accounts' using errcode = '42501';
  end if;
  select u.id into user_id from users u where lower(u.email) = lower(trim(p_email));
  if found then
    existed := true;
    return;
  end if;
  insert into users (email, full_name, phone, password_hash, must_change_password)
    values (lower(trim(p_email)), trim(p_full_name), nullif(trim(p_phone), ''), app.hash_password(p_password), true)
    returning id into user_id;
  existed := false;
end $$;

-- ---------------------------------------------------------------- Row Level Security
do $$
declare t text;
begin
  foreach t in array array['offices','users','teams','levels','memberships','member_levels','office_settings',
    'attendance_records','attendance_corrections','prospects','prospect_interactions','tasks','task_comments',
    'office_plans','plan_activities','activity_registrations','goals','goal_progress','challenges',
    'challenge_participants','challenge_submissions','challenge_rewards','finance_categories','attachments',
    'personal_accounts','personal_transactions','office_accounts','expenses','expense_approvals','fine_categories',
    'fines','fine_payments','fine_disputes','fine_adjustments','office_transactions','office_obligations','budgets',
    'notifications','announcements','audit_logs','sessions','auth_attempts']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- offices / users / memberships
create policy offices_select on offices for select using (app.has_membership(id) or app.is_super());
create policy offices_update on offices for update using (app.is_admin(id)) with check (app.is_admin(id));
create policy offices_insert on offices for insert with check (app.is_super());

create policy users_select on users for select using (id = app.uid() or app.shares_office(id) or app.is_super());
create policy users_update on users for update
  using (id = app.uid() or app.is_super() or (app.shares_office(id) and app.is_admin(app.office())))
  with check (id = app.uid() or app.is_super() or (app.shares_office(id) and app.is_admin(app.office())));

create policy memberships_select on memberships for select
  using (app.is_member(office_id) or user_id = app.uid() or app.is_super());
create policy memberships_insert on memberships for insert with check (app.is_admin(office_id) or app.is_super());
create policy memberships_update on memberships for update
  using (app.is_admin(office_id) or app.is_super()) with check (app.is_admin(office_id) or app.is_super());

-- office-readable reference data, admin-managed
do $$
declare t text;
begin
  foreach t in array array['teams','levels','office_settings','finance_categories','fine_categories']
  loop
    execute format('create policy %I_select on %I for select using (app.is_member(office_id))', t, t);
    execute format('create policy %I_write on %I for all using (app.is_admin(office_id) or app.is_super()) with check (app.is_admin(office_id) or app.is_super())', t, t);
  end loop;
end $$;

create policy member_levels_select on member_levels for select using (app.is_admin(office_id) or (app.is_member(office_id) and user_id = app.uid()));
create policy member_levels_write on member_levels for insert with check (app.is_admin(office_id));

-- attendance: members read their own; all writes by admins or the SECURITY DEFINER self check-in function
create policy attendance_select on attendance_records for select
  using (app.is_admin(office_id) or (app.is_member(office_id) and user_id = app.uid()));
create policy attendance_write on attendance_records for all using (app.is_admin(office_id)) with check (app.is_admin(office_id));
create policy attendance_corrections_select on attendance_corrections for select
  using (app.is_admin(office_id) or exists (select 1 from attendance_records r where r.id = record_id));
create policy attendance_corrections_insert on attendance_corrections for insert with check (app.is_admin(office_id) and corrected_by = app.uid());

-- prospects: private to owner unless shared with the office; admins manage all
create policy prospects_select on prospects for select
  using (app.is_member(office_id) and (owner_id = app.uid() or visibility = 'office' or app.is_admin(office_id)));
create policy prospects_insert on prospects for insert
  with check (app.is_member(office_id) and created_by = app.uid() and (app.is_admin(office_id) or owner_id = app.uid()));
create policy prospects_update on prospects for update
  using (app.is_member(office_id) and (owner_id = app.uid() or app.is_admin(office_id)))
  with check (app.is_member(office_id) and (owner_id = app.uid() or app.is_admin(office_id)));
create policy prospects_delete on prospects for delete using (app.is_admin(office_id));

create policy prospect_interactions_select on prospect_interactions for select
  using (app.is_member(office_id) and exists (select 1 from prospects p where p.id = prospect_id));
create policy prospect_interactions_insert on prospect_interactions for insert
  with check (app.is_member(office_id) and user_id = app.uid()
    and exists (select 1 from prospects p where p.id = prospect_id and (p.owner_id = app.uid() or app.is_admin(p.office_id))));

-- tasks
create policy tasks_select on tasks for select
  using (app.is_member(office_id) and (assignee_id = app.uid() or created_by = app.uid() or app.is_admin(office_id)));
create policy tasks_insert on tasks for insert
  with check (app.is_member(office_id) and created_by = app.uid()
    and (app.is_admin(office_id) or (kind = 'personal' and assignee_id = app.uid())));
create policy tasks_update on tasks for update
  using (app.is_member(office_id) and (assignee_id = app.uid() or app.is_admin(office_id)))
  with check (app.is_member(office_id) and (assignee_id = app.uid() or app.is_admin(office_id)));
create policy tasks_delete on tasks for delete
  using (app.is_admin(office_id) or (app.is_member(office_id) and kind = 'personal' and created_by = app.uid()));

create policy task_comments_select on task_comments for select
  using (app.is_member(office_id) and exists (select 1 from tasks t where t.id = task_id));
create policy task_comments_insert on task_comments for insert
  with check (app.is_member(office_id) and user_id = app.uid() and exists (select 1 from tasks t where t.id = task_id));

-- office plans
create policy office_plans_select on office_plans for select using (app.is_member(office_id) and (status = 'published' or app.is_admin(office_id)));
create policy office_plans_write on office_plans for all using (app.is_admin(office_id)) with check (app.is_admin(office_id));
create policy plan_activities_select on plan_activities for select
  using (app.is_member(office_id) and exists (select 1 from office_plans p where p.id = plan_id));
create policy plan_activities_write on plan_activities for all using (app.is_admin(office_id)) with check (app.is_admin(office_id));
create policy activity_registrations_select on activity_registrations for select
  using (app.is_admin(office_id) or (app.is_member(office_id) and user_id = app.uid()));
create policy activity_registrations_insert on activity_registrations for insert
  with check (app.is_admin(office_id) or (app.is_member(office_id) and user_id = app.uid()
    and exists (select 1 from plan_activities a where a.id = activity_id and a.requires_registration)));
create policy activity_registrations_update on activity_registrations for update
  using (app.is_admin(office_id) or (app.is_member(office_id) and user_id = app.uid()))
  with check (app.is_admin(office_id) or (app.is_member(office_id) and user_id = app.uid()));

-- goals
create policy goals_select on goals for select
  using (app.is_member(office_id) and (scope <> 'individual' or user_id = app.uid() or app.is_admin(office_id)));
create policy goals_write on goals for all using (app.is_admin(office_id)) with check (app.is_admin(office_id));
create policy goal_progress_select on goal_progress for select
  using (app.is_member(office_id) and exists (select 1 from goals g where g.id = goal_id));
create policy goal_progress_insert on goal_progress for insert with check (app.is_admin(office_id));

-- challenges
create policy challenges_select on challenges for select using (app.is_member(office_id) and (status <> 'draft' or app.is_admin(office_id)));
create policy challenges_write on challenges for all using (app.is_admin(office_id)) with check (app.is_admin(office_id));
create policy challenge_participants_select on challenge_participants for select using (app.is_member(office_id));
create policy challenge_participants_insert on challenge_participants for insert
  with check (app.is_admin(office_id) or (app.is_member(office_id) and user_id = app.uid()));
create policy challenge_participants_delete on challenge_participants for delete
  using (app.is_admin(office_id) or (app.is_member(office_id) and user_id = app.uid()));
create policy challenge_submissions_select on challenge_submissions for select
  using (app.is_admin(office_id) or (app.is_member(office_id) and user_id = app.uid()));
create policy challenge_submissions_insert on challenge_submissions for insert
  with check (app.is_member(office_id) and user_id = app.uid() and status = 'pending'
    and exists (select 1 from challenge_participants p where p.challenge_id = challenge_submissions.challenge_id and p.user_id = app.uid()));
create policy challenge_submissions_update on challenge_submissions for update using (app.is_admin(office_id)) with check (app.is_admin(office_id));
create policy challenge_submissions_delete on challenge_submissions for delete
  using (app.is_member(office_id) and user_id = app.uid() and status = 'pending');
create policy challenge_rewards_select on challenge_rewards for select using (app.is_member(office_id));
create policy challenge_rewards_insert on challenge_rewards for insert with check (app.is_admin(office_id) and awarded_by = app.uid());

-- attachments
create policy attachments_select on attachments for select using (app.is_admin(office_id) or (app.is_member(office_id) and uploaded_by = app.uid()));
create policy attachments_insert on attachments for insert with check (app.is_member(office_id) and uploaded_by = app.uid());
create policy attachments_delete on attachments for delete using (app.is_admin(office_id));

-- personal finances: owner only (admins may read when the office setting allows); never writable by others
create policy personal_accounts_select on personal_accounts for select using (app.can_view_finances(office_id, user_id));
create policy personal_accounts_insert on personal_accounts for insert with check (app.is_member(office_id) and user_id = app.uid());
create policy personal_accounts_update on personal_accounts for update
  using (app.is_member(office_id) and user_id = app.uid()) with check (app.is_member(office_id) and user_id = app.uid());
create policy personal_transactions_select on personal_transactions for select using (app.can_view_finances(office_id, user_id));
create policy personal_transactions_insert on personal_transactions for insert
  with check (app.is_member(office_id) and user_id = app.uid() and status in ('recorded', 'pending') and reviewed_by is null);
create policy personal_transactions_update on personal_transactions for update
  using (app.is_member(office_id) and (user_id = app.uid() or (app.is_admin(office_id) and status = 'pending')))
  with check (app.is_member(office_id) and (user_id = app.uid() or app.is_admin(office_id)));
create policy personal_transactions_delete on personal_transactions for delete
  using (app.is_member(office_id) and user_id = app.uid());

-- office books: administrators only
do $$
declare t text;
begin
  foreach t in array array['office_accounts','office_obligations','budgets']
  loop
    execute format('create policy %I_admin on %I for all using (app.is_admin(office_id)) with check (app.is_admin(office_id))', t, t);
  end loop;
end $$;
create policy office_transactions_select on office_transactions for select using (app.is_admin(office_id));
create policy office_transactions_insert on office_transactions for insert with check (app.is_admin(office_id) and recorded_by = app.uid());

-- expenses: members may submit claims and see their own; admins see and manage all
create policy expenses_select on expenses for select using (app.is_admin(office_id) or (app.is_member(office_id) and submitted_by = app.uid()));
create policy expenses_insert on expenses for insert with check (app.is_member(office_id) and submitted_by = app.uid() and status in ('draft', 'pending'));
create policy expenses_update on expenses for update
  using (app.is_admin(office_id) or (app.is_member(office_id) and submitted_by = app.uid()))
  with check (app.is_admin(office_id) or (app.is_member(office_id) and submitted_by = app.uid()));
create policy expenses_delete on expenses for delete
  using ((app.is_admin(office_id) or (app.is_member(office_id) and submitted_by = app.uid())) and status in ('draft', 'rejected'));
create policy expense_approvals_select on expense_approvals for select
  using (app.is_member(office_id) and exists (select 1 from expenses e where e.id = expense_id));
create policy expense_approvals_insert on expense_approvals for insert
  with check (app.is_member(office_id) and actor_id = app.uid() and (app.is_admin(office_id) or action = 'submitted'));

-- fines
create policy fines_select on fines for select using (app.is_admin(office_id) or (app.is_member(office_id) and user_id = app.uid()));
create policy fines_write on fines for all using (app.is_admin(office_id)) with check (app.is_admin(office_id) and issued_by is not null);
create policy fine_payments_select on fine_payments for select using (app.is_admin(office_id) or (app.is_member(office_id) and user_id = app.uid()));
create policy fine_payments_insert on fine_payments for insert
  with check (app.is_member(office_id) and submitted_by = app.uid() and (
    app.is_admin(office_id)
    or (user_id = app.uid() and status = 'pending' and confirmed_by is null
        and exists (select 1 from fines f where f.id = fine_id and f.user_id = app.uid())
        and coalesce((select s.members_submit_fine_payments from office_settings s where s.office_id = fine_payments.office_id), false))));
create policy fine_payments_update on fine_payments for update using (app.is_admin(office_id)) with check (app.is_admin(office_id));
create policy fine_disputes_select on fine_disputes for select using (app.is_admin(office_id) or (app.is_member(office_id) and raised_by = app.uid()));
create policy fine_disputes_insert on fine_disputes for insert
  with check (app.is_member(office_id) and raised_by = app.uid() and status = 'open'
    and exists (select 1 from fines f where f.id = fine_id and f.user_id = app.uid()));
create policy fine_disputes_update on fine_disputes for update using (app.is_admin(office_id)) with check (app.is_admin(office_id));
create policy fine_adjustments_select on fine_adjustments for select
  using (app.is_member(office_id) and exists (select 1 from fines f where f.id = fine_id));
create policy fine_adjustments_insert on fine_adjustments for insert with check (app.is_admin(office_id) and adjusted_by = app.uid());

-- notifications: personal inbox; any office member may notify a colleague in the same office (content is server generated)
create policy notifications_select on notifications for select using (app.is_member(office_id) and user_id = app.uid());
create policy notifications_insert on notifications for insert
  with check (app.is_member(office_id) and exists (select 1 from memberships m where m.office_id = notifications.office_id and m.user_id = notifications.user_id));
create policy notifications_update on notifications for update using (app.is_member(office_id) and user_id = app.uid()) with check (user_id = app.uid());
create policy notifications_delete on notifications for delete using (app.is_member(office_id) and user_id = app.uid());

create policy announcements_select on announcements for select
  using (app.is_member(office_id) and (published_at <= now() or app.is_admin(office_id)));
create policy announcements_write on announcements for all using (app.is_admin(office_id)) with check (app.is_admin(office_id));

-- audit log: append-only; readable by administrators
create policy audit_logs_select on audit_logs for select using (app.is_admin(office_id) or (office_id is null and app.is_super()));
create policy audit_logs_insert on audit_logs for insert with check (actor_id = app.uid() and (app.is_member(office_id) or app.is_super()));

-- sessions and auth_attempts: RLS enabled with no policies => inaccessible to the app role except via the functions above.

-- ---------------------------------------------------------------- grants
grant usage on schema public, app to officehub_app;
grant select, insert, update, delete on all tables in schema public to officehub_app;
grant usage, select on all sequences in schema public to officehub_app;
grant execute on all functions in schema app to officehub_app;

revoke all on sessions, auth_attempts from officehub_app;
revoke update, delete on audit_logs, office_transactions, goal_progress, attendance_corrections, fine_adjustments,
  expense_approvals, member_levels, challenge_rewards from officehub_app;
revoke delete on offices, users, memberships, fines, fine_payments from officehub_app;
-- password hashes are not readable or writable directly
revoke select, insert, update on users from officehub_app;
grant select (id, email, full_name, phone, is_super_admin, must_change_password, created_at, updated_at) on users to officehub_app;
grant update (full_name, phone, email) on users to officehub_app;

alter default privileges in schema public grant select, insert, update, delete on tables to officehub_app;
alter default privileges in schema public grant usage, select on sequences to officehub_app;
alter default privileges in schema app grant execute on functions to officehub_app;
