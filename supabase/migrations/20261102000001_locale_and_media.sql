-- COVA: community languages, media attachments and the media storage bucket.
--
-- Safe to run several times (idempotent). Run it in the Supabase SQL editor:
--   Dashboard -> SQL Editor -> paste -> Run
-- Or with the CLI: supabase db push

------------------------------------------------------------------------ community language

-- Each community belongs to one UI language (en / fr / ar). NULL = legacy community,
-- shown in every language until an admin picks one in the community settings.
alter table public.spaces
  add column if not exists locale text;

------------------------------------------------------------------------ post media

-- Attachments of community posts and group messages:
-- [ { "kind": "image|video|audio|file", "url": "...", "name": "...", "mime": "...", "size": 12345 } ]
alter table public.space_posts
  add column if not exists attachments jsonb not null default '[]'::jsonb;

------------------------------------------------------------------------ media bucket

insert into storage.buckets (id, name, public)
values ('space-media', 'space-media', true)
on conflict (id) do nothing;

-- Everyone signed in may read the media (needed to render posts).
drop policy if exists "space media read" on storage.objects;
create policy "space media read"
on storage.objects for select
to authenticated, anon
using (bucket_id = 'space-media');

-- Signed-in people may upload into their own new folder; the path starts with the space id.
drop policy if exists "space media insert" on storage.objects;
create policy "space media insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'space-media');

-- Uploaders may delete their own files (and staff clean-up comes later if needed).
drop policy if exists "space media delete" on storage.objects;
create policy "space media delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'space-media' and owner = auth.uid());
