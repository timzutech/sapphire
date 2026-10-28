-- Pin search_path on the remaining functions (Supabase linter 0011_function_search_path_mutable).
alter function app.clock() set search_path = public, pg_temp;
alter function app.touch_updated_at() set search_path = public, pg_temp;
alter function app.uid() set search_path = public, pg_temp;
alter function app.office() set search_path = public, pg_temp;
alter function app.tasks_guard() set search_path = public, pg_temp;
alter function app.personal_txn_guard() set search_path = public, pg_temp;
alter function app.office_txn_guard() set search_path = public, pg_temp;
alter function app.expenses_guard() set search_path = public, pg_temp;
alter function app.fines_guard() set search_path = public, pg_temp;
