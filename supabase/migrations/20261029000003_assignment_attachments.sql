alter table public.assignments
  add column if not exists attachment_path text,
  add column if not exists attachment_name text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'assignment-attachments', 'assignment-attachments', false, 20971520,
  array[
    'application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain','image/png','image/jpeg'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Course owners upload assignment attachments" on storage.objects;
create policy "Course owners upload assignment attachments" on storage.objects
for insert to authenticated with check (
  bucket_id = 'assignment-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.assignments a
    join public.courses c on c.id = a.course_id
    where a.id::text = (storage.foldername(name))[2]
      and c.created_by = (select auth.uid())
  )
);

drop policy if exists "Course members read assignment attachments" on storage.objects;
create policy "Course members read assignment attachments" on storage.objects
for select to authenticated using (
  bucket_id = 'assignment-attachments'
  and exists (
    select 1 from public.assignments a
    where a.id::text = (storage.foldername(name))[2]
      and a.attachment_path = name
  )
);

drop policy if exists "Course owners delete assignment attachments" on storage.objects;
create policy "Course owners delete assignment attachments" on storage.objects
for delete to authenticated using (
  bucket_id = 'assignment-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
