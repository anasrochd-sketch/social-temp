create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  course_id text not null references public.courses(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  description text not null default '',
  due_at timestamptz not null,
  points integer not null check (points between 1 and 10000),
  created_at timestamptz not null default now()
);

create index if not exists assignments_course_due_idx on public.assignments(course_id, due_at);
alter table public.assignments enable row level security;
grant select, insert, update, delete on public.assignments to authenticated;

drop policy if exists "Course members can view assignments" on public.assignments;
create policy "Course members can view assignments" on public.assignments
for select to authenticated using (
  exists (select 1 from public.courses c where c.id = course_id and c.created_by = (select auth.uid()))
  or exists (select 1 from public.course_enrollments e where e.course_id = assignments.course_id and e.user_id = (select auth.uid()))
);

drop policy if exists "Course owners can create assignments" on public.assignments;
create policy "Course owners can create assignments" on public.assignments
for insert to authenticated with check (
  created_by = (select auth.uid())
  and exists (select 1 from public.courses c where c.id = course_id and c.created_by = (select auth.uid()))
);

drop policy if exists "Course owners can update assignments" on public.assignments;
create policy "Course owners can update assignments" on public.assignments
for update to authenticated using (
  exists (select 1 from public.courses c where c.id = course_id and c.created_by = (select auth.uid()))
) with check (
  created_by = (select auth.uid())
  and exists (select 1 from public.courses c where c.id = course_id and c.created_by = (select auth.uid()))
);

drop policy if exists "Course owners can delete assignments" on public.assignments;
create policy "Course owners can delete assignments" on public.assignments
for delete to authenticated using (
  exists (select 1 from public.courses c where c.id = course_id and c.created_by = (select auth.uid()))
);

create table if not exists public.assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted', 'graded')),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  submission_text text not null default '',
  storage_path text,
  grade numeric(8,2),
  feedback text not null default '',
  updated_at timestamptz not null default now(),
  unique (assignment_id, student_id),
  check (grade is null or grade >= 0),
  check ((status = 'in_progress' and submitted_at is null) or status in ('submitted', 'graded')),
  check (status = 'in_progress' or submitted_at is not null)
);

create index if not exists assignment_submissions_student_idx on public.assignment_submissions(student_id, assignment_id);
alter table public.assignment_submissions enable row level security;
grant select, insert, update on public.assignment_submissions to authenticated;

drop policy if exists "Students and course owners can view assignment submissions" on public.assignment_submissions;
create policy "Students and course owners can view assignment submissions" on public.assignment_submissions
for select to authenticated using (
  student_id = (select auth.uid())
  or exists (
    select 1 from public.assignments a join public.courses c on c.id = a.course_id
    where a.id = assignment_id and c.created_by = (select auth.uid())
  )
);

drop policy if exists "Enrolled students can start assignments" on public.assignment_submissions;
create policy "Enrolled students can start assignments" on public.assignment_submissions
for insert to authenticated with check (
  student_id = (select auth.uid()) and status = 'in_progress'
  and exists (
    select 1 from public.assignments a
    join public.course_enrollments e on e.course_id = a.course_id
    where a.id = assignment_id and e.user_id = (select auth.uid()) and a.due_at > now()
  )
);

drop policy if exists "Students can submit before the deadline" on public.assignment_submissions;
create policy "Students can submit before the deadline" on public.assignment_submissions
for update to authenticated using (
  student_id = (select auth.uid()) and status = 'in_progress'
  and exists (select 1 from public.assignments a where a.id = assignment_id and a.due_at > now())
) with check (
  student_id = (select auth.uid()) and status in ('in_progress', 'submitted')
  and exists (select 1 from public.assignments a where a.id = assignment_id and a.due_at > now())
);

drop policy if exists "Course owners can grade submissions" on public.assignment_submissions;
create policy "Course owners can grade submissions" on public.assignment_submissions
for update to authenticated using (
  exists (select 1 from public.assignments a join public.courses c on c.id = a.course_id
    where a.id = assignment_id and c.created_by = (select auth.uid()))
) with check (
  exists (select 1 from public.assignments a join public.courses c on c.id = a.course_id
    where a.id = assignment_id and c.created_by = (select auth.uid()))
);

create or replace function public.protect_assignment_submission()
returns trigger language plpgsql set search_path = public as $$
declare
  assignment_owner uuid;
  deadline timestamptz;
begin
  select a.created_by, a.due_at into assignment_owner, deadline
  from public.assignments a where a.id = old.assignment_id;

  if (select auth.uid()) = old.student_id then
    if new.student_id <> old.student_id or new.assignment_id <> old.assignment_id then
      raise exception 'Submission ownership cannot be changed';
    end if;
    if new.storage_path is not null and (
      split_part(new.storage_path, '/', 1) <> new.student_id::text
      or split_part(new.storage_path, '/', 2) <> new.assignment_id::text
    ) then
      raise exception 'Submission file path does not match the student and assignment';
    end if;
    if new.grade is distinct from old.grade or new.feedback is distinct from old.feedback then
      raise exception 'Only the course owner can grade a submission';
    end if;
    if old.status <> 'in_progress' or deadline <= now() then
      raise exception 'The submission deadline has passed';
    end if;
    if new.status not in ('in_progress', 'submitted') then
      raise exception 'Invalid student submission status';
    end if;
  elsif (select auth.uid()) = assignment_owner then
    if new.student_id <> old.student_id or new.assignment_id <> old.assignment_id
      or new.submission_text <> old.submission_text or new.storage_path is distinct from old.storage_path
      or new.started_at <> old.started_at or new.submitted_at is distinct from old.submitted_at then
      raise exception 'Course owners can update grades and feedback only';
    end if;
    if new.grade is not null and new.grade > (select points from public.assignments where id = old.assignment_id) then
      raise exception 'Grade cannot exceed the assignment points';
    end if;
    if new.grade is not null and new.status <> 'graded' then
      raise exception 'A graded submission must have graded status';
    end if;
  else
    raise exception 'Not authorized to update this submission';
  end if;

  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists protect_assignment_submission on public.assignment_submissions;
create trigger protect_assignment_submission before update on public.assignment_submissions
for each row execute function public.protect_assignment_submission();

create or replace function public.get_assignment_participants(p_assignment_id uuid)
returns table (
  student_id uuid,
  submission_id uuid,
  display_name text,
  user_code text,
  status text,
  started_at timestamptz,
  submitted_at timestamptz,
  submission_text text,
  storage_path text,
  grade numeric,
  feedback text
)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.assignments a join public.courses c on c.id = a.course_id
    where a.id = p_assignment_id and c.created_by = (select auth.uid())
  ) then
    raise exception 'Only the course owner can view assignment participants';
  end if;

  return query
  select e.user_id, s.id, p.display_name, p.user_code,
    coalesce(s.status, 'todo'), s.started_at, s.submitted_at,
    s.submission_text, s.storage_path, s.grade, s.feedback
  from public.assignments a
  join public.course_enrollments e on e.course_id = a.course_id
  left join public.profiles p on p.id = e.user_id
  left join public.assignment_submissions s on s.assignment_id = a.id and s.student_id = e.user_id
  where a.id = p_assignment_id
  order by p.display_name nulls last, e.user_id;
end;
$$;
revoke all on function public.get_assignment_participants(uuid) from public;
grant execute on function public.get_assignment_participants(uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'assignment-submissions', 'assignment-submissions', false, 20971520,
  array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain','image/png','image/jpeg']
)
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Students upload assignment work" on storage.objects;
create policy "Students upload assignment work" on storage.objects
for insert to authenticated with check (
  bucket_id = 'assignment-submissions' and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Students remove their own assignment files" on storage.objects;
create policy "Students remove their own assignment files" on storage.objects
for delete to authenticated using (
  bucket_id = 'assignment-submissions' and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Students and course owners read assignment files" on storage.objects;
create policy "Students and course owners read assignment files" on storage.objects
for select to authenticated using (
  bucket_id = 'assignment-submissions' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (
      select 1 from public.assignment_submissions s
      join public.assignments a on a.id = s.assignment_id
      join public.courses c on c.id = a.course_id
      where s.storage_path = name and c.created_by = (select auth.uid())
    )
  )
);
