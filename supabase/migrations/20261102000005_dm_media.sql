-- COVA: WhatsApp-style direct messages — attachments (images, videos, voice notes, files).
--
-- Extends the existing direct_messages table with an `attachments` column and relaxes the
-- body rule so a message can be media-only (a voice note or a photo with no caption).
--
-- Idempotent and safe to run several times. Run it in the Supabase SQL editor:
--   Dashboard -> SQL Editor -> paste -> Run

------------------------------------------------------------------------ attachments column

-- [ { "kind": "image|video|audio|file", "url": "...", "name": "...", "mime": "...", "size": 12345 } ]
alter table public.direct_messages
  add column if not exists attachments jsonb not null default '[]'::jsonb;

-- The original inline check required 1-2000 non-blank characters. Media-only messages have an
-- empty body, so the rule becomes: either a caption (1-2000 chars) or at least one attachment.
alter table public.direct_messages
  drop constraint if exists direct_messages_body_check;

alter table public.direct_messages
  alter column body set default '';

alter table public.direct_messages
  drop constraint if exists direct_messages_body_len;

alter table public.direct_messages
  add constraint direct_messages_body_len
  check (
    jsonb_typeof(attachments) = 'array'
    and (
      attachments <> '[]'::jsonb
      or char_length(btrim(body)) between 1 and 2000
    )
  );

-- Clients may now write attachments together with the existing columns.
grant insert (to_id, body, attachments) on public.direct_messages to authenticated;

------------------------------------------------------------------------ dm media bucket

-- Voice notes, photos and files sent in a DM. Public read like space-media: the message rows
-- themselves stay protected by RLS, and storage paths are unguessable (timestamp + random).
insert into storage.buckets (id, name, public)
values ('dm-media', 'dm-media', true)
on conflict (id) do nothing;

drop policy if exists "dm media read" on storage.objects;
create policy "dm media read"
on storage.objects for select
to authenticated, anon
using (bucket_id = 'dm-media');

drop policy if exists "dm media insert" on storage.objects;
create policy "dm media insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'dm-media');

drop policy if exists "dm media delete" on storage.objects;
create policy "dm media delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'dm-media' and owner = auth.uid());
