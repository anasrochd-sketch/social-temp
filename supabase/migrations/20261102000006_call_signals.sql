-- COVA: WebRTC call signaling for direct messages (voice / video / screen share).
--
-- The table carries short-lived signaling messages between two people: SDP offers/answers
-- and ICE candidates. Media itself never touches the server — it flows browser to browser.
--
-- Idempotent and safe to run several times. Run it in the Supabase SQL editor:
--   Dashboard -> SQL Editor -> paste -> Run

create table if not exists public.call_signals (
  id         uuid primary key default gen_random_uuid(),
  from_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  to_id      uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('offer', 'answer', 'candidate', 'decline', 'hangup')),
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint call_signals_not_self check (from_id <> to_id)
);

create index if not exists call_signals_to_idx
  on public.call_signals (to_id, created_at desc);
create index if not exists call_signals_from_idx
  on public.call_signals (from_id, created_at desc);

alter table public.call_signals enable row level security;

grant select, delete on public.call_signals to authenticated;
grant insert (to_id, kind, payload) on public.call_signals to authenticated;

create policy call_signals_select on public.call_signals
  for select to authenticated
  using (from_id = auth.uid() or to_id = auth.uid());

create policy call_signals_insert on public.call_signals
  for insert to authenticated
  with check (from_id = auth.uid() and to_id <> auth.uid());

create policy call_signals_delete on public.call_signals
  for delete to authenticated
  using (from_id = auth.uid() or to_id = auth.uid());

-- Realtime: push new signals to the two parties while their app is open.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'call_signals'
    ) then
      alter publication supabase_realtime add table public.call_signals;
    end if;
  end if;
end
$$;
