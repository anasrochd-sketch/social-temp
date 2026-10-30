alter table public.assignments
  add column if not exists exercise_type text not null default 'written'
    check (exercise_type in ('quiz','matching','intruder','ordering','written','coding','file','mixed')),
  add column if not exists questions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(questions) = 'array');

alter table public.assignment_submissions
  add column if not exists answers jsonb not null default '[]'::jsonb
    check (jsonb_typeof(answers) = 'array');

create table if not exists public.assignment_answer_keys (
  assignment_id uuid primary key references public.assignments(id) on delete cascade,
  answer_key jsonb not null default '[]'::jsonb check (jsonb_typeof(answer_key) = 'array')
);
alter table public.assignment_answer_keys enable row level security;
grant select, insert, update, delete on public.assignment_answer_keys to authenticated;
drop policy if exists "Course owners manage assignment answer keys" on public.assignment_answer_keys;
create policy "Course owners manage assignment answer keys" on public.assignment_answer_keys
for all to authenticated using (
  exists (select 1 from public.assignments a join public.courses c on c.id = a.course_id
    where a.id = assignment_id and c.created_by = (select auth.uid()))
) with check (
  exists (select 1 from public.assignments a join public.courses c on c.id = a.course_id
    where a.id = assignment_id and c.created_by = (select auth.uid()))
);

create or replace function public.protect_assignment_submission()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  assignment_owner uuid;
  deadline timestamptz;
  created_time timestamptz;
  max_points integer;
  late_cutoff timestamptz;
  allowed_seconds double precision;
  late_seconds double precision;
  answer_key jsonb;
  key_count integer;
  objective_count integer := 0;
  correct_count integer := 0;
  answer_index integer;
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
    if now() >= late_cutoff then raise exception 'The submission window has closed'; end if;
    if old.status <> 'in_progress' or new.status not in ('in_progress', 'submitted') then
      raise exception 'Invalid student submission status';
    end if;
    if new.status = 'submitted' then
      new.submitted_at := now();
      allowed_seconds := greatest(extract(epoch from (deadline - created_time)), 1);
      late_seconds := greatest(extract(epoch from (now() - deadline)), 0);
      select k.answer_key into answer_key from public.assignment_answer_keys k where k.assignment_id = old.assignment_id;
      key_count := coalesce(jsonb_array_length(answer_key), 0);
      if key_count > 0 then
        for answer_index in 0..key_count - 1 loop
          if (answer_key -> answer_index) is not null and (answer_key -> answer_index) <> 'null'::jsonb then
            objective_count := objective_count + 1;
            if (new.answers -> answer_index) = (answer_key -> answer_index) then correct_count := correct_count + 1; end if;
          end if;
        end loop;
        if objective_count > 0 then
          new.grade := round(greatest(0, max_points * correct_count::numeric / objective_count * (1 - late_seconds / allowed_seconds)), 2);
        else
          new.grade := round(greatest(0, max_points * (1 - late_seconds / allowed_seconds))::numeric, 2);
        end if;
      else
        new.grade := round(greatest(0, max_points * (1 - late_seconds / allowed_seconds))::numeric, 2);
      end if;
    end if;
  elsif (select auth.uid()) = assignment_owner then
    if new.student_id <> old.student_id or new.assignment_id <> old.assignment_id
      or new.submission_text <> old.submission_text or new.storage_path is distinct from old.storage_path
      or new.started_at <> old.started_at or new.submitted_at is distinct from old.submitted_at
      or new.answers is distinct from old.answers then
      raise exception 'Course owners can update grades and feedback only';
    end if;
    if new.grade is not null and new.grade > max_points then raise exception 'Grade cannot exceed the assignment points'; end if;
    if new.grade is not null and new.status <> 'graded' then raise exception 'A graded submission must have graded status'; end if;
  else
    raise exception 'Not authorized to update this submission';
  end if;

  new.updated_at := now();
  return new;
end;
$$;
