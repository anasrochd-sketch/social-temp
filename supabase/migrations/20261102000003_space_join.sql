-- Round 4: fix "تعذر الانضمام للمجموعة" (Error joining group).
--
-- The spaces / space_members tables live in the production database (not created by
-- this repo's migrations), and the direct INSERT from GroupDetail is rejected there.
-- This migration adds a SECURITY DEFINER RPC that joins a group safely and returns a
-- readable result, plus — only when RLS is enabled — a self-insert policy so the
-- older direct-insert fallback also works. Safe to run twice.

create or replace function public.join_space(p_space uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  s public.spaces;
begin
  if me is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in first.');
  end if;

  select * into s from public.spaces where id = p_space and kind = 'group';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Group not found.');
  end if;

  if exists (
    select 1 from public.space_members where space_id = s.id and user_id = me
  ) then
    return jsonb_build_object('ok', true, 'spaceId', s.id, 'outcome', 'already-member');
  end if;

  if s.visibility = 'private' then
    insert into public.space_join_requests (space_id, user_id, status)
    values (s.id, me, 'pending')
    on conflict do nothing;
    return jsonb_build_object('ok', true, 'spaceId', s.id, 'outcome', 'requested');
  end if;

  insert into public.space_members (space_id, user_id, role)
  values (s.id, me, 'member')
  on conflict do nothing;

  return jsonb_build_object('ok', true, 'spaceId', s.id, 'outcome', 'joined');
exception
  when others then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$$;

grant execute on function public.join_space(uuid) to authenticated;

-- Only touches the live database when RLS is actually enabled on space_members;
-- skipped otherwise. Lets a signed-in user insert their own membership row.
do $$
begin
  if exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'space_members' and rowsecurity
  )
  and not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'space_members'
      and policyname = 'space_members_self_insert'
  ) then
    execute
      'create policy space_members_self_insert on public.space_members
         for insert to authenticated
         with check (user_id = auth.uid())';
  end if;
end
$$;
