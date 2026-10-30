-- Rich profiles and avatars.
--
-- 1. profiles gains the fields the /profile page edits: headline (title), domain
--    (field of study), programming and spoken languages, and an avatar URL.
--    bio / display_name already exist. Everything is nullable or defaulted, and
--    safe to re-run.
-- 2. avatars: a public storage bucket (anyone can display a photo, only the
--    owner can write inside their own <user id>/ folder).

alter table public.profiles
  add column if not exists headline text not null default '' check (char_length(headline) <= 120),
  add column if not exists domain text not null default '' check (char_length(domain) <= 80),
  add column if not exists prog_languages text[] not null default '{}',
  add column if not exists spoken_languages text[] not null default '{}',
  add column if not exists avatar_url text;

-- The own-row update policy may already exist from the social schema; recreate it
-- so the new fields are writable, and extend the column grants.
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "Users update their own profile" on public.profiles;
create policy "Users update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

grant update (display_name, bio, headline, domain, prog_languages, spoken_languages, avatar_url)
  on public.profiles to authenticated;

-------------------------------------------------------------------- avatars

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars', 'avatars', true, 2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users upload their avatar" on storage.objects;
create policy "Users upload their avatar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users replace their avatar" on storage.objects;
create policy "Users replace their avatar"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users delete their avatar" on storage.objects;
create policy "Users delete their avatar"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Anyone can view avatars" on storage.objects;
create policy "Anyone can view avatars"
  on storage.objects for select
  using (bucket_id = 'avatars');
