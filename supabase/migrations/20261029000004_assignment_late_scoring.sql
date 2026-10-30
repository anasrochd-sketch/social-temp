-- Allow proportionally scored late submissions for one assignment-duration
-- after the due date. A duration of 7 days gives a 7-day late window.
drop policy if exists "Enrolled students can start assignments" on public.assignment_submissions;
create policy "Enrolled students can start assignments" on public.assignment_submissions
for insert to authenticated with check (
  student_id = (select auth.uid()) and status = 'in_progress'
  and exists (
    select 1 from public.assignments a
    join public.course_enrollments e on e.course_id = a.course_id
    where a.id = assignment_id and e.user_id = (select auth.uid())
      and now() < a.due_at + (a.due_at - a.created_at)
  )
);

drop policy if exists "Students can submit before the deadline" on public.assignment_submissions;
create policy "Students can submit before the deadline" on public.assignment_submissions
for update to authenticated using (
  student_id = (select auth.uid()) and status = 'in_progress'
  and exists (
    select 1 from public.assignments a
    where a.id = assignment_id and now() < a.due_at + (a.due_at - a.created_at)
  )
) with check (
  student_id = (select auth.uid()) and status in ('in_progress', 'submitted')
  and exists (
    select 1 from public.assignments a
    where a.id = assignment_id and now() < a.due_at + (a.due_at - a.created_at)
  )
);

create or replace function public.protect_assignment_submission()
returns trigger language plpgsql set search_path = public as $$
declare
  assignment_owner uuid;
  deadline timestamptz;
  created_time timestamptz;
  max_points integer;
  late_cutoff timestamptz;
  allowed_seconds double precision;
  late_seconds double precision;
begin
  select a.created_by, a.due_at, a.created_at, a.points
    into assignment_owner, deadline, created_time, max_points
  from public.assignments a where a.id = old.assignment_id;
  late_cutoff := deadline + (deadline - created_time);

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
      raise exception 'Only the course owner can change a grade or feedback';
    end if;
    if now() >= late_cutoff then
      raise exception 'The submission window has closed';
    end if;
    if old.status <> 'in_progress' or new.status not in ('in_progress', 'submitted') then
      raise exception 'Invalid student submission status';
    end if;
    if new.status = 'submitted' then
      new.submitted_at := now();
      allowed_seconds := greatest(extract(epoch from (deadline - created_time)), 1);
      late_seconds := greatest(extract(epoch from (now() - deadline)), 0);
      new.grade := round(greatest(0, max_points * (1 - late_seconds / allowed_seconds))::numeric, 2);
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
