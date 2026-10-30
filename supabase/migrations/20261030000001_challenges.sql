create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  description text not null default '',
  category text not null check (category in ('Daily','Weekly','Coding','Community')),
  difficulty text not null check (difficulty in ('Easy','Medium','Hard')),
  points integer not null check (points between 1 and 1000),
  minutes integer not null check (minutes between 1 and 1440),
  exercise_type text not null check (exercise_type in ('quiz','matching','intruder','ordering','written','coding','file')),
  questions jsonb not null default '[]'::jsonb check (jsonb_typeof(questions) = 'array'),
  attachment_path text,
  attachment_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.challenge_answer_keys (
  challenge_id uuid primary key references public.challenges(id) on delete cascade,
  answer_key jsonb not null default '[]'::jsonb check (jsonb_typeof(answer_key) = 'array')
);

create table if not exists public.challenge_submissions (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'in_progress' check (status in ('in_progress','submitted')),
  answers jsonb not null default '[]'::jsonb,
  response_text text not null default '',
  storage_path text,
  file_name text,
  score numeric(8,2),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (challenge_id, user_id)
);

create index if not exists challenges_created_idx on public.challenges(created_at desc);
create index if not exists challenge_submissions_challenge_idx on public.challenge_submissions(challenge_id, created_at desc);
alter table public.challenges enable row level security;
alter table public.challenge_answer_keys enable row level security;
alter table public.challenge_submissions enable row level security;
grant select, insert, update, delete on public.challenges to authenticated;
grant select, insert, update, delete on public.challenge_answer_keys to authenticated;
grant select, insert on public.challenge_submissions to authenticated;

drop policy if exists "Authenticated users can view challenges" on public.challenges;
create policy "Authenticated users can view challenges" on public.challenges
for select to authenticated using (true);
drop policy if exists "Users create their own challenges" on public.challenges;
create policy "Users create their own challenges" on public.challenges
for insert to authenticated with check (created_by = (select auth.uid()));
drop policy if exists "Authors update their challenges" on public.challenges;
create policy "Authors update their challenges" on public.challenges
for update to authenticated using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));
drop policy if exists "Authors delete their challenges" on public.challenges;
create policy "Authors delete their challenges" on public.challenges
for delete to authenticated using (created_by = (select auth.uid()));

drop policy if exists "Authors view challenge answer keys" on public.challenge_answer_keys;
create policy "Authors view challenge answer keys" on public.challenge_answer_keys
for select to authenticated using (exists (select 1 from public.challenges c where c.id = challenge_id and c.created_by = (select auth.uid())));
drop policy if exists "Authors manage challenge answer keys" on public.challenge_answer_keys;
create policy "Authors manage challenge answer keys" on public.challenge_answer_keys
for all to authenticated using (exists (select 1 from public.challenges c where c.id = challenge_id and c.created_by = (select auth.uid())))
with check (exists (select 1 from public.challenges c where c.id = challenge_id and c.created_by = (select auth.uid())));

drop policy if exists "Users read own challenge submissions and authors read entries" on public.challenge_submissions;
create policy "Users read own challenge submissions and authors read entries" on public.challenge_submissions
for select to authenticated using (
  user_id = (select auth.uid())
  or exists (select 1 from public.challenges c where c.id = challenge_id and c.created_by = (select auth.uid()))
);
drop policy if exists "Users start own challenges" on public.challenge_submissions;
create policy "Users start own challenges" on public.challenge_submissions
for insert to authenticated with check (user_id = (select auth.uid()) and status = 'in_progress');

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
  return awarded;
end;
$$;
revoke all on function public.submit_challenge(uuid,jsonb,text,text,text) from public;
grant execute on function public.submit_challenge(uuid,jsonb,text,text,text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('challenge-files','challenge-files',false,20971520)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;
drop policy if exists "Challenge authors and students upload challenge files" on storage.objects;
create policy "Challenge authors and students upload challenge files" on storage.objects
for insert to authenticated with check (
  bucket_id = 'challenge-files'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (select 1 from public.challenges c where c.id::text = (storage.foldername(name))[1])
);
drop policy if exists "Challenge authors and submitters read challenge files" on storage.objects;
create policy "Challenge authors and submitters read challenge files" on storage.objects
for select to authenticated using (
  bucket_id = 'challenge-files'
  and exists (
    select 1 from public.challenges c where c.id::text = (storage.foldername(name))[1]
      and (c.created_by = (select auth.uid()) or exists (
        select 1 from public.challenge_submissions s where s.challenge_id = c.id and s.user_id = (storage.foldername(name))[2]::uuid
      ))
  )
);
drop policy if exists "Users delete their challenge files" on storage.objects;
create policy "Users delete their challenge files" on storage.objects
for delete to authenticated using (bucket_id = 'challenge-files' and (storage.foldername(name))[2] = (select auth.uid())::text);
