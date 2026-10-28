-- Hardening for hosted Postgres platforms (e.g. Supabase) that expose the `public` schema through an auto-generated
-- REST/GraphQL API using the `anon` and `authenticated` roles. OfficeHub never uses those APIs: all access goes through
-- the Next.js server as `officehub_app`. RLS already denies those roles every row; this also removes their privileges.
-- No-op on plain PostgreSQL where the roles don't exist.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated']
  loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all tables in schema public from %I', r);
      execute format('revoke all on all sequences in schema public from %I', r);
      execute format('revoke all on all functions in schema public from %I', r);
      execute format('revoke all on schema app from %I', r);
      execute format('revoke all on all functions in schema app from %I', r);
      execute format('alter default privileges in schema public revoke all on tables from %I', r);
      execute format('alter default privileges in schema public revoke all on sequences from %I', r);
      execute format('alter default privileges in schema public revoke all on functions from %I', r);
    end if;
  end loop;
end $$;

-- Functions are executable by PUBLIC by default; restrict the app schema to the application role.
revoke execute on all functions in schema app from public;
grant execute on all functions in schema app to officehub_app;
alter default privileges in schema app revoke execute on functions from public;
