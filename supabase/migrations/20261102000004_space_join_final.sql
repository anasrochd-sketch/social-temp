-- ============================================================================
-- 20261102000004_space_join_final.sql   (canonical / self-repairing)
-- Fixes "تعذر الانضمام للمجموعة" (failed to join a group).
--
-- This file supersedes 20261102000003_space_join.sql and is the ONE file to
-- run on the live database. It is identical to 03 except that join_space()
-- first drops ALL of its existing overloads — the live database keeps an old
-- join_space() with a different return type, which made plain
-- create-or-replace fail with:
--   ERROR 42P13: cannot change return type of existing function join_space
--
-- Fully idempotent: every policy is drop-if-exists, helpers are
-- create-or-replace, and both join_by_code() and join_space() drop their old
-- overloads before the canonical version is created. Safe to run on the live
-- database and on a fresh one after 20261102000003.
-- ============================================================================

-------------------------------------------------------------------- helpers
-- SECURITY DEFINER so policies can check membership without RLS recursion.

create or replace function public.is_space_member(p_space uuid)
returns boolean
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or to_regclass('public.space_members') is null then
    return false;
  end if;
  return exists (
    select 1 from public.space_members m
    where m.space_id = p_space and m.user_id = auth.uid()
  );
end;
$$;

create or replace function public.is_space_owner(p_space uuid)
returns boolean
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or to_regclass('public.spaces') is null then
    return false;
  end if;
  return exists (
    select 1 from public.spaces s
    where s.id = p_space and s.owner_id = auth.uid()
  );
end;
$$;

-- Community mirror rows inside `spaces` (kind = 'community'): visible to the
-- members of the corresponding community.
create or replace function public.is_community_member(p_space uuid)
returns boolean
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or to_regclass('public.community_members') is null then
    return false;
  end if;
  return exists (
    select 1 from public.community_members cm
    where cm.community_id = p_space and cm.user_id = auth.uid()
  );
end;
$$;

revoke execute on function
  public.is_space_member(uuid), public.is_space_owner(uuid), public.is_community_member(uuid)
  from public, anon;
grant execute on function
  public.is_space_member(uuid), public.is_space_owner(uuid), public.is_community_member(uuid)
  to authenticated;

---------------------------------------------------------------- spaces RLS
do $$
begin
  if to_regclass('public.spaces') is not null then
    alter table public.spaces enable row level security;

    -- Everyone signed-in sees public groups; private ones only for members/owner.
    drop policy if exists spaces_select_v3 on public.spaces;
    create policy spaces_select_v3 on public.spaces
      for select to authenticated
      using (
        visibility = 'public'
        or owner_id = auth.uid()
        or public.is_space_member(id)
        or public.is_community_member(id)
      );

    -- Creating a group makes you the owner.
    drop policy if exists spaces_insert_v3 on public.spaces;
    create policy spaces_insert_v3 on public.spaces
      for insert to authenticated
      with check (owner_id = auth.uid());

    -- Only the owner edits group settings.
    drop policy if exists spaces_update_v3 on public.spaces;
    create policy spaces_update_v3 on public.spaces
      for update to authenticated
      using (owner_id = auth.uid())
      with check (owner_id = auth.uid());
  end if;
end
$$;

----------------------------------------------------------- space_members RLS
do $$
begin
  if to_regclass('public.space_members') is not null then
    alter table public.space_members enable row level security;

    -- Read: your own rows, the owner of the space, or any member of a public group.
    drop policy if exists space_members_select_v3 on public.space_members;
    create policy space_members_select_v3 on public.space_members
      for select to authenticated
      using (
        user_id = auth.uid()
        or public.is_space_owner(space_id)
        or exists (
          select 1 from public.spaces s
          where s.id = space_id and s.visibility = 'public'
        )
      );

    -- THE FIX: join a public group yourself (what the "join" button does).
    drop policy if exists space_members_insert_self_v3 on public.space_members;
    create policy space_members_insert_self_v3 on public.space_members
      for insert to authenticated
      with check (
        user_id = auth.uid()
        and role = 'member'
        and exists (
          select 1 from public.spaces s
          where s.id = space_id and s.visibility = 'public'
        )
      );

    -- Owners can add members directly.
    drop policy if exists space_members_insert_owner_v3 on public.space_members;
    create policy space_members_insert_owner_v3 on public.space_members
      for insert to authenticated
      with check (public.is_space_owner(space_id));

    -- Leave on your own; owner can remove anyone.
    drop policy if exists space_members_delete_v3 on public.space_members;
    create policy space_members_delete_v3 on public.space_members
      for delete to authenticated
      using (user_id = auth.uid() or public.is_space_owner(space_id));

    drop policy if exists space_members_update_v3 on public.space_members;
    create policy space_members_update_v3 on public.space_members
      for update to authenticated
      using (user_id = auth.uid() or public.is_space_owner(space_id))
      with check (user_id = auth.uid() or public.is_space_owner(space_id));
  end if;
end
$$;

------------------------------------------------------------- space_posts RLS
do $$
begin
  if to_regclass('public.space_posts') is not null then
    alter table public.space_posts enable row level security;

    -- Read posts of groups you can see (public groups, or groups you belong to).
    drop policy if exists space_posts_select_v3 on public.space_posts;
    create policy space_posts_select_v3 on public.space_posts
      for select to authenticated
      using (
        exists (
          select 1 from public.spaces s
          where s.id = space_id
            and (
              s.visibility = 'public'
              or s.owner_id = auth.uid()
              or public.is_space_member(s.id)
            )
        )
      );

    -- Post only inside groups you are a member of, as yourself.
    drop policy if exists space_posts_insert_v3 on public.space_posts;
    create policy space_posts_insert_v3 on public.space_posts
      for insert to authenticated
      with check (
        author_id = auth.uid()
        and public.is_space_member(space_id)
      );

    -- Edit/delete your own posts; owner moderates everything.
    drop policy if exists space_posts_update_v3 on public.space_posts;
    create policy space_posts_update_v3 on public.space_posts
      for update to authenticated
      using (author_id = auth.uid() or public.is_space_owner(space_id))
      with check (author_id = auth.uid() or public.is_space_owner(space_id));

    drop policy if exists space_posts_delete_v3 on public.space_posts;
    create policy space_posts_delete_v3 on public.space_posts
      for delete to authenticated
      using (author_id = auth.uid() or public.is_space_owner(space_id));
  end if;
end
$$;

-------------------------- join_by_code(): drop old overloads, rebuild fresh
-- Drops every existing copy of join_by_code in schema public, then creates
-- exactly one canonical version. Prevents "function is not unique" when the
-- client calls supabase.rpc("join_by_code", { p_code }).
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_catalog.pg_proc p
    where p.proname = 'join_by_code'
      and p.pronamespace = 'public'::regnamespace
  loop
    execute format('drop function if exists %s', r.fn);
  end loop;
end
$$;

-- Community codes first (original behaviour), then group invite codes from
-- join_codes (kind = 'space'). The client reads communityId / outcome keys.
create function public.join_by_code(p_code text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  normalized text := upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'));
  cid uuid;
  cvis text;
  sp record;
begin
  if me is null then raise exception 'Sign in to join.'; end if;
  if normalized = '' then raise exception 'That code doesn''t match anything.'; end if;

  -- 1) Community codes (original behaviour).
  if to_regclass('public.community_join_codes') is not null then
    select c2.id, c2.visibility into cid, cvis
    from public.community_join_codes jc
    join public.communities c2 on c2.id = jc.community_id
    where jc.code = normalized
    limit 1;

    if cid is not null then
      if exists (select 1 from public.community_members where community_id = cid and user_id = me) then
        return jsonb_build_object('communityId', cid, 'outcome', 'already-member');
      end if;

      if cvis = 'public' then
        insert into public.community_members (community_id, user_id, role)
        values (cid, me, 'member')
        on conflict do nothing;
        return jsonb_build_object('communityId', cid, 'outcome', 'joined');
      end if;

      if exists (select 1 from public.join_requests where community_id = cid and user_id = me) then
        return jsonb_build_object('communityId', cid, 'outcome', 'already-requested');
      end if;

      insert into public.join_requests (community_id, user_id) values (cid, me)
      on conflict do nothing;
      return jsonb_build_object('communityId', cid, 'outcome', 'requested');
    end if;
  end if;

  -- 2) Group / space invite codes stored in join_codes (kind = 'space').
  if to_regclass('public.join_codes') is not null and to_regclass('public.spaces') is not null then
    select s.* into sp
    from public.join_codes jc
    join public.spaces s on s.id = jc.target_id
    where jc.kind = 'space' and jc.code = normalized
    limit 1;

    if found then
      if exists (select 1 from public.space_members m where m.space_id = sp.id and m.user_id = me) then
        return jsonb_build_object('communityId', sp.id, 'outcome', 'already-member');
      end if;

      -- Having the invite code IS the invitation: private groups admit directly.
      insert into public.space_members (space_id, user_id, role)
      values (sp.id, me, 'member')
      on conflict do nothing;
      return jsonb_build_object('communityId', sp.id, 'outcome', 'joined');
    end if;
  end if;

  raise exception 'That code doesn''t match any community.';
end;
$$;

revoke execute on function public.join_by_code(text) from public, anon;
grant execute on function public.join_by_code(text) to authenticated;

---------------------------- join_space(): drop old overloads, rebuild fresh
-- The live database still keeps an OLD join_space() with a different return
-- type, so plain create-or-replace fails with 42P13. Drop every overload in
-- schema public first, then create exactly one canonical version.
-- GroupDetail calls supabase.rpc("join_space", { p_space: group.id }) first
-- and falls back to a direct insert only when this function is missing. It
-- returns readable { ok, error, outcome } results instead of throwing, so
-- the UI can show real errors.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_catalog.pg_proc p
    where p.proname = 'join_space'
      and p.pronamespace = 'public'::regnamespace
  loop
    execute format('drop function if exists %s', r.fn);
  end loop;
end
$$;

create function public.join_space(p_space uuid)
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
    -- Private groups need an invite; if a request queue exists, file one.
    if to_regclass('public.space_join_requests') is not null then
      insert into public.space_join_requests (space_id, user_id, status)
      values (s.id, me, 'pending')
      on conflict do nothing;
      return jsonb_build_object('ok', true, 'spaceId', s.id, 'outcome', 'requested');
    end if;
    return jsonb_build_object('ok', false, 'error', 'This group is private. Ask for an invite code.');
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

revoke execute on function public.join_space(uuid) from public, anon;
grant execute on function public.join_space(uuid) to authenticated;
