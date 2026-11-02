-- ============================================================================
-- 20261102000005_dm_rich_media.sql
-- WhatsApp-style direct messages: image / video / audio (voice notes) / file
-- attachments on direct_messages.
--
-- Media files themselves are uploaded to the existing public "space-media"
-- bucket under the dm/ folder (same policies the group posts already use).
--
-- Idempotent and safe to run on the live database:
--   * attachments column is added if missing (jsonb, default '[]')
--   * the legacy body CHECK (NOT NULL + 1..2000 chars) is replaced by a
--     relaxed one so attachment-only messages (body NULL) are allowed
--   * a new CHECK requires at least one of body / attachments
--   * the insert grant is extended to cover attachments
--   * direct_messages re-added to the realtime publication if missing
-- ============================================================================

do $$
declare
  c text;
begin
  if to_regclass('public.direct_messages') is null then
    raise notice 'direct_messages not found — nothing to do.';
    return;
  end if;

  -- 1) attachments column (same shape as space_posts.attachments).
  alter table public.direct_messages
    add column if not exists attachments jsonb not null default '[]'::jsonb;

  -- 2) Drop every legacy CHECK that constrains body, whatever its name is in
  --    this database (direct_messages_not_self does not mention body and
  --    survives).
  for c in
    select con.conname
    from pg_catalog.pg_constraint con
    where con.conrelid = 'public.direct_messages'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%body%'
  loop
    execute format('alter table public.direct_messages drop constraint %I', c);
  end loop;

  -- 3) body becomes optional so a message can carry only media.
  alter table public.direct_messages alter column body drop not null;

  -- 4) Fresh checks: optional body with same length rules, but never empty.
  alter table public.direct_messages
    add constraint direct_messages_body_check
    check (body is null or char_length(btrim(body)) between 1 and 2000);

  alter table public.direct_messages
    add constraint direct_messages_content_check
    check (body is not null or jsonb_array_length(attachments) > 0);

  -- 5) Column-level grant: clients may now insert attachments alongside
  --    to_id/body. from_id stays server-side (default auth.uid()).
  grant insert (to_id, body, attachments) on public.direct_messages to authenticated;
end
$$;

-- Realtime publication (defensive re-add, same guarded pattern as 20261012000002).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and to_regclass('public.direct_messages') is not null
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'direct_messages'
     )
  then
    alter publication supabase_realtime add table public.direct_messages;
  end if;
end
$$;
