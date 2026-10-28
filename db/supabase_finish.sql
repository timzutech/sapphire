-- OfficeHub: final Supabase setup. Edit the 5 values marked  <-- CHANGE , then run the whole file in SQL Editor.
begin;

-- 1. Pin function search paths (security advisor fix)
alter function app.clock() set search_path = public, pg_temp;
alter function app.touch_updated_at() set search_path = public, pg_temp;
alter function app.uid() set search_path = public, pg_temp;
alter function app.office() set search_path = public, pg_temp;
alter function app.tasks_guard() set search_path = public, pg_temp;
alter function app.personal_txn_guard() set search_path = public, pg_temp;
alter function app.office_txn_guard() set search_path = public, pg_temp;
alter function app.expenses_guard() set search_path = public, pg_temp;
alter function app.fines_guard() set search_path = public, pg_temp;

-- 2. Password for the app's restricted database user (goes into DATABASE_URL). Use a long random string.
alter role officehub_app with login password 'REPLACE-WITH-A-LONG-RANDOM-PASSWORD';   -- <-- CHANGE

-- 3. Your office and your administrator account (you will be asked to change this password at first sign-in).
do $$
declare
  v_office_name text := 'My Office';                 -- <-- CHANGE
  v_admin_name  text := 'Your Full Name';            -- <-- CHANGE
  v_admin_email text := 'you@example.com';           -- <-- CHANGE
  v_admin_pass  text := 'TemporaryPassw0rd';          -- <-- CHANGE (8+ chars, letter and number)
  o uuid; u uuid;
begin
  insert into offices (name, slug, timezone, currency, locale)
    values (v_office_name, trim(both '-' from regexp_replace(lower(v_office_name), '[^a-z0-9]+', '-', 'g')), 'Africa/Lagos', 'NGN', 'en-NG')
    returning id into o;
  insert into office_settings (office_id) values (o);
  insert into finance_categories (office_id, scope, kind, name, system_key) values
    (o, 'office', 'income', 'Fine collections', 'fine_collections'), (o, 'office', 'income', 'Member contributions', null),
    (o, 'office', 'income', 'Sales & commissions', null), (o, 'office', 'income', 'Other income', null),
    (o, 'office', 'expense', 'Operations', null), (o, 'office', 'expense', 'Training', null),
    (o, 'office', 'expense', 'Incentives & rewards', null), (o, 'office', 'expense', 'Rent & utilities', null),
    (o, 'office', 'expense', 'Transport', null), (o, 'office', 'expense', 'Other expenses', null),
    (o, 'personal', 'income', 'Commission', null), (o, 'personal', 'income', 'Sales', null), (o, 'personal', 'income', 'Bonus', null),
    (o, 'personal', 'income', 'Other income', null), (o, 'personal', 'expense', 'Transport', null), (o, 'personal', 'expense', 'Food', null),
    (o, 'personal', 'expense', 'Business tools', null), (o, 'personal', 'expense', 'Training', null), (o, 'personal', 'expense', 'Other expenses', null);
  insert into office_accounts (office_id, name, kind) values (o, 'Cash box', 'cash'), (o, 'Bank account', 'bank');
  insert into fine_categories (office_id, name, default_amount, description) values
    (o, 'Lateness', 500, 'Checked in after the late threshold'),
    (o, 'Unexcused absence', 1000, 'Absent on a working day without an excuse'),
    (o, 'Missed deadline', 1000, 'Assigned task not completed by its deadline');
  insert into levels (office_id, name, rank, criteria) values (o, 'Starter', 0, 'New member'), (o, 'Level 1', 1, 'Defined by the office administrator');
  insert into users (email, full_name, password_hash, is_super_admin, must_change_password)
    values (lower(trim(v_admin_email)), v_admin_name, app.hash_password(v_admin_pass), true, true)
    returning id into u;
  insert into memberships (office_id, user_id, role) values (o, u, 'admin');
  insert into audit_logs (office_id, actor_id, action, entity_type, entity_id, summary)
    values (o, u, 'office.create', 'office', o, 'Office created during initial setup');
end $$;

commit;
