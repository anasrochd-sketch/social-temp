-- Keep the invitation code available to the course owner after creation.
-- The existing create_course_invite RPC remains responsible for generating codes.

alter table public.courses
  add column if not exists invitation_code text;

create unique index if not exists courses_invitation_code_unique
  on public.courses (invitation_code)
  where invitation_code is not null;

create or replace function public.save_course_invite_code(
  p_course_id text,
  p_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_code is null or length(trim(p_code)) = 0 or length(trim(p_code)) > 32 then
    raise exception 'Invalid invitation code';
  end if;

  update public.courses
     set invitation_code = upper(trim(p_code))
   where id = p_course_id
     and created_by = auth.uid();

  if not found then
    raise exception 'Course not found or not owned by the current user';
  end if;
end;
$$;

create or replace function public.get_course_invite_code(p_course_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select c.invitation_code
    from public.courses as c
   where c.id = p_course_id
     and c.created_by = auth.uid()
   limit 1;
$$;

revoke all on function public.save_course_invite_code(text, text) from public;
revoke all on function public.get_course_invite_code(text) from public;
grant execute on function public.save_course_invite_code(text, text) to authenticated;
grant execute on function public.get_course_invite_code(text) to authenticated;
