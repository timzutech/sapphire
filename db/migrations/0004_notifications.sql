-- Notifications for other users are delivered through this function: INSERT ... ON CONFLICT evaluates the SELECT
-- policy (own inbox only) against the new row, so cross-user idempotent inserts cannot be done directly under RLS.
create or replace function app.push_notifications(
  p_office uuid, p_users uuid[], p_kind text, p_title text, p_body text, p_link text, p_dedupe text
) returns integer
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  if not app.is_member(p_office) then
    raise exception 'Not allowed to notify members of this office' using errcode = '42501';
  end if;
  if p_link is not null and p_link !~ '^/[A-Za-z0-9/_?=&%.-]*$' then
    raise exception 'Notification links must be relative application paths' using errcode = 'P0001';
  end if;
  insert into notifications (office_id, user_id, kind, title, body, link, dedupe_key)
  select p_office, m.user_id, p_kind, left(p_title, 200), left(p_body, 1000), p_link, p_dedupe
  from memberships m
  where m.office_id = p_office and m.user_id = any (p_users)
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function app.push_notifications(uuid, uuid[], text, text, text, text, text) to officehub_app;
