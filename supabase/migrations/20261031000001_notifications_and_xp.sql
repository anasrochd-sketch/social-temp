-- Notifications and server-side XP.
--
-- 1. notifications: one row per event that concerns a specific person (friend
--    request received/answered, join request received/decided, member joined or
--    removed, role changed, assignment created/graded, resource shared, XP earned).
--    Rows are written only by the SECURITY DEFINER trigger functions below, so
--    authenticated clients get no INSERT grant. Realtime streams each person
--    their own rows (the RLS select policy filters them).
-- 2. XP: submit_challenge now credits the earned score to profiles.xp. The score
--    is computed here from the answer keys; the client never decides its own XP.
--
-- The file is defensive: safe to re-run, and every trigger that touches a table
-- which may not exist yet (spaces, course_enrollments) is guarded with to_regclass.

---------------------------------------------------------------- notifications

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null,
  actor_id   uuid references auth.users (id) on delete set null,
  text       text not null default '',
  detail     text not null default '',
  href       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant delete on public.notifications to authenticated;

drop policy if exists "Users read their notifications" on public.notifications;
create policy "Users read their notifications"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users mark their notifications read" on public.notifications;
create policy "Users mark their notifications read"
  on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users delete their notifications" on public.notifications;
create policy "Users delete their notifications"
  on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

-- Stream new rows to the owner's open sessions (no-op when already added).
do $$
begin
  begin
    alter publication supabase_realtime add table public.notifications;
  exception when duplicate_object then null;
  end;
end $$;

---------------------------------------------------------------- notify helper

-- Inserts one notification. SECURITY DEFINER so the event triggers below can
-- write rows for other people; clients never call it and have no INSERT grant.
create or replace function public.notify(
  p_user   uuid,
  p_kind   text,
  p_actor  uuid,
  p_href   text,
  p_text   text,
  p_detail text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  insert into public.notifications (user_id, kind, actor_id, href, text, detail)
  values (p_user, p_kind, p_actor, p_href, coalesce(p_text, ''), coalesce(p_detail, ''));
end;
$$;
revoke all on function public.notify(uuid, text, uuid, text, text, text) from public, authenticated, anon;

------------------------------------------------------------------- XP awarding

-- Same signature and behaviour as 20261030000001, plus: a graded score is
-- credited to profiles.xp once (a challenge can only be submitted once per
-- person: the submission row must be in_progress and is unique per pair).
create or replace function public.submit_challenge(
  p_challenge_id uuid,
  p_answers jsonb,
  p_response_text text,
  p_storage_path text,
  p_file_name text
) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  current_user_id uuid := (select auth.uid());
  challenge_row public.challenges%rowtype;
  keys jsonb;
  answer_count integer;
  correct_count integer := 0;
  answer_index integer;
  awarded numeric;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  select * into challenge_row from public.challenges where id = p_challenge_id;
  if not found then raise exception 'Challenge not found'; end if;
  if challenge_row.created_by = current_user_id then raise exception 'Authors cannot submit their own challenge'; end if;
  if p_storage_path is not null and (split_part(p_storage_path, '/', 1) <> challenge_row.id::text or split_part(p_storage_path, '/', 2) <> current_user_id::text) then
    raise exception 'Challenge file path does not match the user and challenge';
  end if;
  if not exists (select 1 from public.challenge_submissions s where s.challenge_id = p_challenge_id and s.user_id = current_user_id and s.status = 'in_progress') then
    raise exception 'Start the challenge before submitting';
  end if;
  select answer_key into keys from public.challenge_answer_keys where challenge_id = p_challenge_id;
  answer_count := jsonb_array_length(coalesce(keys, '[]'::jsonb));
  if answer_count > 0 then
    for answer_index in 0..answer_count - 1 loop
      if (p_answers -> answer_index) = (keys -> answer_index) then correct_count := correct_count + 1; end if;
    end loop;
    awarded := round(challenge_row.points * correct_count::numeric / answer_count, 2);
  else
    awarded := null;
  end if;
  update public.challenge_submissions set status = 'submitted', answers = coalesce(p_answers, '[]'::jsonb),
    response_text = coalesce(p_response_text, ''), storage_path = p_storage_path, file_name = p_file_name,
    score = awarded, submitted_at = now()
  where challenge_id = p_challenge_id and user_id = current_user_id and status = 'in_progress';
  if awarded is not null then
    update public.profiles set xp = coalesce(xp, 0) + awarded where id = current_user_id;
    perform public.notify(current_user_id, 'xp_earned', current_user_id,
      '/challenges/' || p_challenge_id::text, challenge_row.title,
      rtrim(rtrim(awarded::text, '0'), '.'));
  end if;
  return awarded;
end;
$$;
revoke all on function public.submit_challenge(uuid, jsonb, text, text, text) from public;
grant execute on function public.submit_challenge(uuid, jsonb, text, text, text) to authenticated;

------------------------------------------------------------------- triggers

-- Friend requests: the recipient hears about a new request, the sender about an
-- acceptance. Answers to pending requests go through direct row updates/RPCs.
create or replace function public.notify_on_friendship_write()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform public.notify(new.to_id, 'friend_request', new.from_id, '/community', '', '');
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'accepted' then
    perform public.notify(new.from_id, 'friend_accepted', new.to_id, '/community', '', '');
  end if;
  return null;
end;
$$;

drop trigger if exists friendship_notify on public.friendships;
create trigger friendship_notify
after insert or update on public.friendships
for each row execute function public.notify_on_friendship_write();

-- Community spaces: join requests (staff hears, requester hears the decision),
-- membership changes and role changes. Only created when the live schema has
-- the spaces tables.
create or replace function public.notify_on_join_request_write()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor uuid := (select auth.uid());
  space_name text;
  kind text;
  m record;
begin
  select name into space_name from public.spaces where id = new.space_id;

  if tg_op = 'INSERT' then
    for m in
      select user_id from public.space_members
      where space_id = new.space_id and role in ('owner', 'admin')
    loop
      perform public.notify(m.user_id, 'join_request', new.user_id,
        '/community/' || new.space_id::text, space_name, '');
    end loop;
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status is distinct from 'pending' then
    kind := case
      when new.status in ('approved', 'accepted', 'member', 'active') then 'join_request_approved'
      else 'join_request_denied'
    end;
    perform public.notify(new.user_id, kind, actor,
      '/community/' || new.space_id::text, space_name, '');
  end if;
  return null;
end;
$$;

create or replace function public.notify_on_space_member_write()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor uuid := (select auth.uid());
  space_name text;
  m record;
begin
  select name into space_name from public.spaces
  where id = coalesce(new.space_id, old.space_id);

  if tg_op = 'INSERT' then
    if new.role <> 'owner' then
      for m in
        select user_id from public.space_members
        where space_id = new.space_id and role in ('owner', 'admin') and user_id <> new.user_id
      loop
        perform public.notify(m.user_id, 'member_joined', new.user_id,
          '/community/' || new.space_id::text, space_name, '');
      end loop;
    end if;
  elsif tg_op = 'UPDATE' and old.role is distinct from new.role then
    perform public.notify(new.user_id, 'role_changed', actor,
      '/community/' || new.space_id::text, space_name, new.role);
  elsif tg_op = 'DELETE' and old.role <> 'owner' then
    perform public.notify(old.user_id, 'member_removed', actor,
      '/community/' || old.space_id::text, space_name, '');
  end if;
  return null;
end;
$$;

do $$
begin
  if to_regclass('public.spaces') is not null
     and to_regclass('public.space_members') is not null
     and to_regclass('public.space_join_requests') is not null then

    drop trigger if exists join_request_notify on public.space_join_requests;
    create trigger join_request_notify
    after insert or update on public.space_join_requests
    for each row execute function public.notify_on_join_request_write();

    drop trigger if exists space_member_notify on public.space_members;
    create trigger space_member_notify
    after insert or update or delete on public.space_members
    for each row execute function public.notify_on_space_member_write();
  end if;
end $$;

-- Assignments: enrolled students hear about a new assignment; a student hears
-- when their submission is graded (grade changes from null to a value).
create or replace function public.notify_on_assignment_insert()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  course_title text := '';
begin
  if to_regclass('public.course_enrollments') is null then return null; end if;
  if to_regclass('public.courses') is not null then
    select title into course_title from public.courses where id = new.course_id;
  end if;
  insert into public.notifications (user_id, kind, actor_id, href, text, detail)
  select e.user_id, 'assignment_created', new.created_by,
         '/assignments/' || new.id::text,
         new.title, coalesce(course_title, '')
  from public.course_enrollments e
  where e.course_id = new.course_id and e.user_id <> new.created_by;
  return null;
end;
$$;

create or replace function public.notify_on_submission_update()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor uuid := (select auth.uid());
  assignment_title text := '';
begin
  if tg_op = 'UPDATE' and old.grade is distinct from new.grade and new.grade is not null then
    select title into assignment_title from public.assignments where id = new.assignment_id;
    perform public.notify(new.student_id, 'assignment_graded', actor,
      '/assignments/' || new.assignment_id::text, assignment_title,
      rtrim(rtrim(new.grade::text, '0'), '.'));
  end if;
  return null;
end;
$$;

drop trigger if exists assignment_notify on public.assignments;
create trigger assignment_notify
after insert on public.assignments
for each row execute function public.notify_on_assignment_insert();

drop trigger if exists submission_grade_notify on public.assignment_submissions;
create trigger submission_grade_notify
after update on public.assignment_submissions
for each row execute function public.notify_on_submission_update();

-- Shared resources: students of the linked course hear about a new resource.
create or replace function public.notify_on_course_resource_insert()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor uuid := (select auth.uid());
  resource_title text := '';
  course_title text := '';
begin
  if to_regclass('public.course_enrollments') is null then return null; end if;
  select title into resource_title from public.shared_resources where id = new.resource_id;
  if to_regclass('public.courses') is not null then
    select title into course_title from public.courses where id = new.course_id;
  end if;
  insert into public.notifications (user_id, kind, actor_id, href, text, detail)
  select e.user_id, 'resource_added', actor,
         '/courses/' || new.course_id::text,
         coalesce(resource_title, ''), coalesce(course_title, '')
  from public.course_enrollments e
  where e.course_id = new.course_id and e.user_id <> actor;
  return null;
end;
$$;

drop trigger if exists course_resource_notify on public.course_resources;
create trigger course_resource_notify
after insert on public.course_resources
for each row execute function public.notify_on_course_resource_insert();
