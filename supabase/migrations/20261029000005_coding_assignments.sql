alter table public.assignments
  add column if not exists kind text not null default 'general';

alter table public.assignments drop constraint if exists assignments_kind_check;
alter table public.assignments add constraint assignments_kind_check
  check (kind in ('general', 'coding'));
