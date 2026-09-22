-- Dedicated objects for Zero. Existing application schemas are untouched.
create table if not exists public.zero_rooms (
 code text primary key check (code ~ '^[A-Z2-9]{6}$'),
 state jsonb not null,
 revision bigint not null default 0,
 owner_hash text not null,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now() + interval '2 hours'
);
create index if not exists zero_rooms_owner on public.zero_rooms(owner_hash);
create index if not exists zero_rooms_expiry on public.zero_rooms(expires_at);
alter table public.zero_rooms enable row level security;
revoke all on public.zero_rooms from public, anon, authenticated;
grant select, insert, update, delete on public.zero_rooms to service_role;
comment on table public.zero_rooms is 'Zero game state. Edge Function only; no client SELECT policies. Private hands and hashed session keys are never directly exposed.';

create table if not exists public.zero_rate_limits (
 key text primary key,
 hits integer not null default 1,
 expires_at timestamptz not null default now() + interval '3 minutes'
);
alter table public.zero_rate_limits enable row level security;
revoke all on public.zero_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.zero_rate_limits to service_role;
create index if not exists zero_rate_limits_expiry on public.zero_rate_limits(expires_at);
create or replace function public.zero_rate_hit(p_key text)
returns integer language sql security invoker set search_path = '' as $$
 insert into public.zero_rate_limits(key) values(p_key)
 on conflict (key) do update set hits = public.zero_rate_limits.hits + 1
 returning hits;
$$;
revoke all on function public.zero_rate_hit(text) from public, anon, authenticated;
grant execute on function public.zero_rate_hit(text) to service_role;
