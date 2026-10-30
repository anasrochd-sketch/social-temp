create table if not exists public.shared_resources (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 120),
  type text not null constraint shared_resources_type_check
    check (type in ('Article', 'Video', 'Cheatsheet', 'Tool', 'Book', 'Exercise')),
  description text check (description is null or char_length(description) <= 1000),
  category text not null check (char_length(trim(category)) between 1 and 60),
  minutes integer not null constraint shared_resources_minutes_check
    check (minutes between 1 and 1440),
  file_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 20971520),
  storage_path text not null unique,
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint shared_resources_storage_path_owner check (
    split_part(storage_path, '/', 1) = uploaded_by::text
  )
);

-- Also supports projects that applied the earlier resource-storage draft.
alter table public.shared_resources
  add column if not exists type text not null default 'Article';
alter table public.shared_resources
  add column if not exists minutes integer not null default 5;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'shared_resources_type_check'
  ) then
    alter table public.shared_resources
      add constraint shared_resources_type_check
      check (type in ('Article', 'Video', 'Cheatsheet', 'Tool', 'Book', 'Exercise'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'shared_resources_minutes_check'
  ) then
    alter table public.shared_resources
      add constraint shared_resources_minutes_check
      check (minutes between 1 and 1440);
  end if;
end $$;

alter table public.shared_resources
  drop constraint if exists shared_resources_type_check;
alter table public.shared_resources
  add constraint shared_resources_type_check
  check (type in ('Article', 'Video', 'Cheatsheet', 'Tool', 'Book', 'Exercise'));

create table if not exists public.course_resources (
  course_id text not null references public.courses(id) on delete cascade,
  resource_id uuid not null references public.shared_resources(id) on delete cascade,
  added_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (course_id, resource_id)
);

grant select, insert, delete on public.shared_resources to authenticated;
grant select, insert, delete on public.course_resources to authenticated;

create index if not exists course_resources_resource_id_idx
  on public.course_resources (resource_id);

alter table public.course_resources enable row level security;

drop policy if exists "Authenticated users can view course resource links" on public.course_resources;
create policy "Authenticated users can view course resource links"
  on public.course_resources for select to authenticated using (true);

drop policy if exists "Course owners can link resources" on public.course_resources;
create policy "Course owners can link resources"
  on public.course_resources for insert to authenticated
  with check (
    added_by = (select auth.uid())
    and exists (
      select 1 from public.courses c
      where c.id = course_id and c.created_by = (select auth.uid())
    )
  );

drop policy if exists "Course owners can unlink resources" on public.course_resources;
create policy "Course owners can unlink resources"
  on public.course_resources for delete to authenticated
  using (
    exists (
      select 1 from public.courses c
      where c.id = course_id and c.created_by = (select auth.uid())
    )
  );

create index if not exists shared_resources_created_at_idx
  on public.shared_resources (created_at desc);

alter table public.shared_resources enable row level security;

drop policy if exists "Authenticated users can view shared resources" on public.shared_resources;
create policy "Authenticated users can view shared resources"
  on public.shared_resources for select to authenticated using (true);

drop policy if exists "Users can share their own resources" on public.shared_resources;
create policy "Users can share their own resources"
  on public.shared_resources for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and split_part(storage_path, '/', 1) = (select auth.uid())::text
  );

drop policy if exists "Users can delete their own resources" on public.shared_resources;
create policy "Users can delete their own resources"
  on public.shared_resources for delete to authenticated
  using (uploaded_by = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'shared-resources',
  'shared-resources',
  false,
  20971520,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'image/png',
    'image/jpeg'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Authenticated users can read shared resource files" on storage.objects;
create policy "Authenticated users can read shared resource files"
  on storage.objects for select to authenticated
  using (bucket_id = 'shared-resources');

drop policy if exists "Users can upload their own shared resource files" on storage.objects;
create policy "Users can upload their own shared resource files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'shared-resources'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can delete their own shared resource files" on storage.objects;
create policy "Users can delete their own shared resource files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'shared-resources'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
