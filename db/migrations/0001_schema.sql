-- OfficeHub core schema.
-- Money: numeric(14,2) everywhere. Timestamps: timestamptz (UTC); office-local calendar dates are stored as `date`
-- computed in the office timezone. All office-owned tables carry office_id for isolation.

create schema if not exists app;

-- Runtime role used by the web application. RLS applies to it (it is not the table owner and has no BYPASSRLS).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'officehub_app') then
    create role officehub_app nologin;
  end if;
end $$;

create or replace function app.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------- offices, users, membership
create table offices (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  timezone text not null default 'Africa/Lagos',
  currency char(3) not null default 'NGN',
  locale text not null default 'en-NG',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  password_hash text not null,
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  phone text,
  is_super_admin boolean not null default false,
  must_change_password boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index users_email_key on users (lower(email));

create table teams (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references offices(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  description text,
  created_at timestamptz not null default now(),
  unique (office_id, name)
);

-- Configurable progression levels ("step up" is defined by each office, never assumed).
create table levels (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references offices(id) on delete cascade,
  name text not null,
  rank integer not null check (rank >= 0),
  criteria text,
  created_at timestamptz not null default now(),
  unique (office_id, rank),
  unique (office_id, name)
);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references offices(id) on delete cascade,
  user_id uuid not null references users(id) on delete restrict,
  role text not null check (role in ('admin', 'member')),
  team_id uuid references teams(id) on delete set null,
  title text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  joined_on date not null default current_date,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (office_id, user_id)
);
create index memberships_user_idx on memberships (user_id);

create table member_levels (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references offices(id) on delete cascade,
  user_id uuid not null references users(id),
  level_id uuid not null references levels(id) on delete restrict,
  achieved_on date not null default current_date,
  note text,
  set_by uuid not null references users(id),
  created_at timestamptz not null default now()
);
create index member_levels_user_idx on member_levels (office_id, user_id, achieved_on desc);

create table office_settings (
  office_id uuid primary key references offices(id) on delete cascade,
  checkin_opens time not null default '06:00',
  late_after time not null default '09:00',
  checkin_closes time not null default '13:00',
  working_days smallint[] not null default '{1,2,3,4,5}',  -- ISO weekday numbers, 1 = Monday
  attendance_reminders boolean not null default true,
  members_submit_fine_payments boolean not null default true,
  admin_view_member_finances boolean not null default true,
  reminders_last_run_at timestamptz,
  updated_at timestamptz not null default now(),
  check (checkin_opens <= late_after and late_after <= checkin_closes),
  check (working_days <@ '{1,2,3,4,5,6,7}'::smallint[])
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  office_id uuid references offices(id) on delete set null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index sessions_user_idx on sessions (user_id);

create table auth_attempts (
  id bigserial primary key,
  key text not null,
  created_at timestamptz not null default now()
);
create index auth_attempts_key_idx on auth_attempts (key, created_at desc);

-- ---------------------------------------------------------------- attendance
create table attendance_records (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references offices(id) on delete cascade,
  user_id uuid not null references users(id),
  att_date date not null,
  status text not null check (status in ('present', 'late', 'absent', 'excused')),
  check_in_at timestamptz,
  source text not null check (source in ('self', 'admin', 'system')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (office_id, user_id, att_date)
);
create index attendance_office_date_idx on attendance_records (office_id, att_date);

create table attendance_corrections (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references offices(id) on delete cascade,
  record_id uuid not null references attendance_records(id) on delete cascade,
  previous_status text,
  new_status text not null,
  reason text not null check (length(trim(reason)) >= 3),
  corrected_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- prospects
create table prospects (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references offices(id) on delete cascade,
  owner_id uuid references users(id),
  visibility text not null default 'private' check (visibility in ('private', 'office')),
  name text not null check (length(trim(name)) between 1 and 120),
  phone text,
  phone_norm text generated always as (nullif(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '')) stored,
  email text,
  source text,
  stage text not null default 'new'
    check (stage in ('new', 'contacted', 'follow_up', 'interested', 'in_progress', 'converted', 'not_interested')),
  estimated_value numeric(14,2) check (estimated_value is null or estimated_value >= 0),
  last_contact_on date,
  next_follow_up date,
  next_action text,
  notes text,
  converted_at timestamptz,
  archived_at timestamptz,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (visibility = 'office' or owner_id is not null)
);
create index prospects_owner_idx on prospects (office_id, owner_id);
create index prospects_followup_idx on prospects (office_id, next_follow_up) where archived_at is null;
create unique index prospects_phone_unique on prospects (office_id, phone_norm) where phone_norm is not null and archived_at is null;
create unique index prospects_email_unique on prospects (office_id, lower(email)) where email is not null and archived_at is null;

create table prospect_interactions (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references offices(id) on delete cascade,
  prospect_id uuid not null references prospects(id) on delete cascade,
  user_id uuid not null references users(id),
  kind text not null check (kind in ('call', 'meeting', 'message', 'email', 'note', 'stage_change', 'assignment')),
  summary text not null,
  occurred_at timestamptz not null default now()
);
create index prospect_interactions_idx on prospect_interactions (prospect_id, occurred_at desc);

-- ---------------------------------------------------------------- tasks
create table tasks (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references offices(id) on delete cascade,
  title text not null check (length(trim(title)) between 2 and 160),
  description text,
  assignee_id uuid not null references users(id),
  created_by uuid not null references users(id),
  kind text not null check (kind in ('assigned', 'personal')),
  batch_id uuid,
  start_date date,
  due_date date,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'cancelled')),
  progress smallint not null default 0 check (progress between 0 and 100),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_date is null or due_date is null or due_date >= start_date)
);
create index tasks_assignee_idx on tasks (office_id, assignee_id, status);
create index tasks_due_idx on tasks (office_id, due_date) where status in ('pending', 'in_progress');

create table task_comments (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references offices(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  user_id uuid not null references users(id),
  body text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index task_comments_task_idx on task_comments (task_id, created_at);

-- ---------------------------------------------------------------- office plans
create table office_plans (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references offices(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  title text not null,
  summary text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (office_id, month)
);

create table plan_activities (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references offices(id) on delete cascade,
  plan_id uuid not null references office_plans(id) on delete cascade,
  kind text not null check (kind in ('training', 'workshop', 'prospecting', 'meeting', 'incentive', 'challenge', 'development', 'deadline', 'announcement')),
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  requires_registration boolean not null default false,
  capacity integer check (capacity is null or capacity > 0),
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);
create index plan_activities_plan_idx on plan_activities (plan_id, starts_at);

create table activity_registrations (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references offices(id) on delete cascade,
  activity_id uuid not null references plan_activities(id) on delete cascade,
  user_id uuid not null references users(id),
  status text not null default 'registered' check (status in ('registered', 'attended', 'absent', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (activity_id, user_id)
);

-- ---------------------------------------------------------------- goals
create table goals (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references offices(id) on delete cascade,
  scope text not null check (scope in ('office', 'team', 'individual')),
  user_id uuid references users(id),
  team_id uuid references teams(id) on delete set null,
  title text not null,
  description text,
  category text not null check (category in ('progression', 'earnings', 'active_members', 'prospecting', 'conversion', 'training', 'tools', 'personal_development', 'team_performance', 'challenges', 'attendance', 'tasks', 'other')),
  unit text not null default 'count',
  target_value numeric(14,2) not null,
  current_value numeric(14,2) not null default 0,
  start_date date not null,
  end_date date not null,
  responsible_user_id uuid references users(id),
  progress_mode text not null default 'manual' check (progress_mode in ('manual', 'auto')),
  metric text check (metric in ('attendance_days', 'prospects_added', 'prospects_converted', 'tasks_completed', 'personal_income', 'office_income', 'active_members', 'training_attended', 'members_at_level', 'challenge_score')),
  metric_param text,
  status text not null default 'active' check (status in ('active', 'achieved', 'missed', 'cancelled')),
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (scope <> 'individual' or user_id is not null),
  check (scope <> 'team' or team_id is not null),
  check (progress_mode = 'manual' or metric is not null)
);
create index goals_office_idx on goals (office_id, scope, end_date);

create table goal_progress (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references offices(id) on delete cascade,
  goal_id uuid not null references goals(id) on delete cascade,
  value numeric(14,2) not null,
  target_value numeric(14,2) not null,
  note text,
  recorded_by uuid references users(id),
  recorded_at timestamptz not null default now()
);
create index goal_progress_goal_idx on goal_progress (goal_id, recorded_at);

-- ---------------------------------------------------------------- challenges
create table challenges (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references offices(id) on delete cascade,
  name text not null,
  description text,
  start_date date not null,
  end_date date not null,
  participation text not null default 'individual' check (participation in ('individual', 'team')),
  metric text not null check (metric in ('manual', 'prospects_added', 'prospects_converted', 'personal_income', 'tasks_completed', 'training_attended', 'attendance_days')),
  unit text not null default 'points',
  target_value numeric(14,2) check (target_value is null or target_value > 0),
  requires_verification boolean not null default true,
  eligibility text not null default 'all' check (eligibility in ('all', 'team', 'min_level')),
  eligible_team_id uuid references teams(id) on delete set null,
  eligible_min_rank integer,
  reward text,
  leaderboard_enabled boolean not null default true,
  status text not null default 'draft' check (status in ('draft', 'published', 'cancelled')),
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table challenge_participants (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references offices(id) on delete cascade,
  challenge_id uuid not null references challenges(id) on delete cascade,
  user_id uuid not null references users(id),
  team_id uuid references teams(id) on delete set null,
  joined_at timestamptz not null default now(),
  unique (challenge_id, user_id)
);

create table challenge_submissions (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references offices(id) on delete cascade,
  challenge_id uuid not null references challenges(id) on delete cascade,
  user_id uuid not null references users(id),
  value numeric(14,2) not null check (value > 0),
  description text not null,
  occurred_on date not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  review_note text,
  client_token uuid not null unique,
  created_at timestamptz not null default now()
);
create index challenge_submissions_idx on challenge_submissions (challenge_id, user_id, status);

create table challenge_rewards (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references offices(id) on delete cascade,
  challenge_id uuid not null references challenges(id) on delete cascade,
  user_id uuid not null references users(id),
  rank integer,
  reward text not null,
  awarded_by uuid not null references users(id),
  awarded_at timestamptz not null default now(),
  unique (challenge_id, user_id)
);

-- ---------------------------------------------------------------- finance: shared
create table finance_categories (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references offices(id) on delete cascade,
  scope text not null check (scope in ('office', 'personal')),
  kind text not null check (kind in ('income', 'expense')),
  name text not null,
  system_key text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (office_id, scope, kind, name)
);
create unique index finance_categories_system_key on finance_categories (office_id, system_key) where system_key is not null;

create table attachments (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references offices(id) on delete cascade,
  uploaded_by uuid not null references users(id),
  filename text not null,
  mime_type text not null check (mime_type in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 5242880),
  data bytea not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- finance: personal (member-owned, separate from office books)
create table personal_accounts (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references offices(id) on delete cascade,
  user_id uuid not null references users(id),
  name text not null,
  kind text not null check (kind in ('cash', 'savings', 'other')),
  opening_balance numeric(14,2) not null default 0,
  opening_date date not null default current_date,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (office_id, user_id, name)
);

-- Signed effect on an account = direction * base_sign(type) * amount. A correction of a finalized row is a new row
-- with reverses_id set and direction negated (append-only), so totals and balances net out automatically.
create table personal_transactions (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references offices(id) on delete cascade,
  user_id uuid not null references users(id),
  account_id uuid not null references personal_accounts(id),
  to_account_id uuid references personal_accounts(id),
  type text not null check (type in ('income', 'expense', 'transfer', 'adjustment')),
  amount numeric(14,2) not null check (amount > 0),
  direction smallint not null default 1 check (direction in (1, -1)),
  category_id uuid references finance_categories(id),
  txn_date date not null,
  description text not null check (length(trim(description)) between 1 and 200),
  notes text,
  status text not null default 'recorded' check (status in ('recorded', 'pending', 'approved', 'rejected')),
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  review_note text,
  reverses_id uuid unique references personal_transactions(id),
  client_token uuid not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((type = 'transfer') = (to_account_id is not null)),
  check (to_account_id is null or to_account_id <> account_id)
);
create index personal_transactions_user_idx on personal_transactions (office_id, user_id, txn_date desc);

create view personal_ledger with (security_invoker = true) as
  select t.id as txn_id, t.office_id, t.user_id, t.account_id, t.txn_date, t.type, t.status,
         t.direction * t.amount * (case t.type when 'income' then 1 when 'adjustment' then 1 else -1 end) as signed_amount
  from personal_transactions t
  where t.status <> 'rejected'
  union all
  select t.id, t.office_id, t.user_id, t.to_account_id, t.txn_date, t.type, t.status, t.direction * t.amount
  from personal_transactions t
  where t.type = 'transfer' and t.status <> 'rejected';

-- ---------------------------------------------------------------- finance: office books (admin only)
create table office_accounts (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references offices(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('cash', 'bank', 'mobile_money', 'other')),
  opening_balance numeric(14,2) not null default 0,
  opening_date date not null default current_date,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (office_id, name)
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references offices(id) on delete cascade,
  title text not null check (length(trim(title)) between 2 and 160),
  category_id uuid not null references finance_categories(id),
  amount numeric(14,2) not null check (amount > 0),
  expense_date date not null,
  payment_method text,
  responsible_user_id uuid references users(id),
  vendor text,
  description text,
  attachment_id uuid references attachments(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'pending', 'approved', 'rejected', 'paid')),
  submitted_by uuid not null references users(id),
  submitted_at timestamptz,
  paid_account_id uuid references office_accounts(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index expenses_office_idx on expenses (office_id, status, expense_date desc);

create table expense_approvals (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references offices(id) on delete cascade,
  expense_id uuid not null references expenses(id) on delete cascade,
  action text not null check (action in ('submitted', 'approved', 'rejected', 'paid', 'reopened')),
  actor_id uuid not null references users(id),
  note text,
  created_at timestamptz not null default now()
);

create table fine_categories (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references offices(id) on delete cascade,
  name text not null,
  default_amount numeric(14,2) check (default_amount is null or default_amount > 0),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (office_id, name)
);

create table fines (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references offices(id) on delete cascade,
  user_id uuid not null references users(id),
  category_id uuid references fine_categories(id),
  reason text not null check (length(trim(reason)) >= 3),
  amount numeric(14,2) not null check (amount > 0),
  issued_on date not null,
  due_date date,
  status text not null default 'pending' check (status in ('pending', 'partially_paid', 'paid', 'waived', 'disputed')),
  issued_by uuid not null references users(id),
  waived_by uuid references users(id),
  waived_at timestamptz,
  waive_reason text,
  attendance_record_id uuid references attendance_records(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'waived' or (waive_reason is not null and waived_by is not null))
);
create index fines_user_idx on fines (office_id, user_id, status);

create table fine_payments (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references offices(id) on delete cascade,
  fine_id uuid not null references fines(id) on delete restrict,
  user_id uuid not null references users(id),
  amount numeric(14,2) not null check (amount > 0),
  paid_on date not null,
  method text,
  reference text,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  submitted_by uuid not null references users(id),
  confirmed_by uuid references users(id),
  confirmed_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);
create index fine_payments_fine_idx on fine_payments (fine_id);

create table fine_disputes (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references offices(id) on delete cascade,
  fine_id uuid not null references fines(id) on delete cascade,
  raised_by uuid not null references users(id),
  reason text not null check (length(trim(reason)) >= 5),
  status text not null default 'open' check (status in ('open', 'upheld', 'rejected')),
  resolution_note text,
  resolved_by uuid references users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index fine_disputes_one_open on fine_disputes (fine_id) where status = 'open';

create table fine_adjustments (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references offices(id) on delete cascade,
  fine_id uuid not null references fines(id) on delete cascade,
  previous_amount numeric(14,2) not null,
  new_amount numeric(14,2) not null,
  reason text not null,
  adjusted_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

create table office_transactions (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references offices(id) on delete cascade,
  account_id uuid not null references office_accounts(id),
  to_account_id uuid references office_accounts(id),
  type text not null check (type in ('income', 'expense', 'transfer', 'adjustment')),
  amount numeric(14,2) not null check (amount > 0),
  direction smallint not null default 1 check (direction in (1, -1)),
  category_id uuid references finance_categories(id),
  txn_date date not null,
  reference text,
  counterparty text,
  description text not null,
  notes text,
  expense_id uuid unique references expenses(id),
  fine_payment_id uuid unique references fine_payments(id),
  reverses_id uuid unique references office_transactions(id),
  recorded_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  check ((type = 'transfer') = (to_account_id is not null)),
  check (to_account_id is null or to_account_id <> account_id)
);
create index office_transactions_date_idx on office_transactions (office_id, txn_date desc);

create view office_ledger with (security_invoker = true) as
  select t.id as txn_id, t.office_id, t.account_id, t.txn_date, t.type, t.category_id,
         t.direction * t.amount * (case t.type when 'income' then 1 when 'adjustment' then 1 else -1 end) as signed_amount
  from office_transactions t
  union all
  select t.id, t.office_id, t.to_account_id, t.txn_date, t.type, t.category_id, t.direction * t.amount
  from office_transactions t where t.type = 'transfer';

create table office_obligations (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references offices(id) on delete cascade,
  kind text not null check (kind in ('receivable', 'payable')),
  counterparty text not null,
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  due_date date,
  status text not null default 'open' check (status in ('open', 'settled', 'cancelled')),
  settled_txn_id uuid references office_transactions(id),
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table budgets (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references offices(id) on delete cascade,
  category_id uuid not null references finance_categories(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  amount numeric(14,2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  unique (office_id, category_id, month)
);

-- ---------------------------------------------------------------- communication & audit
create table notifications (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references offices(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id, office_id, created_at desc);
create unique index notifications_dedupe on notifications (user_id, dedupe_key) where dedupe_key is not null;

create table announcements (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references offices(id) on delete cascade,
  title text not null,
  body text not null,
  pinned boolean not null default false,
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  office_id uuid references offices(id) on delete cascade,
  actor_id uuid references users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  summary text not null,
  before jsonb,
  after jsonb,
  reason text,
  created_at timestamptz not null default now()
);
create index audit_logs_office_idx on audit_logs (office_id, created_at desc);

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['offices','users','memberships','office_settings','attendance_records','prospects','tasks',
    'office_plans','activity_registrations','goals','challenges','personal_transactions','expenses','fines','office_obligations']
  loop
    execute format('create trigger %I_touch before update on %I for each row execute function app.touch_updated_at()', t, t);
  end loop;
end $$;
