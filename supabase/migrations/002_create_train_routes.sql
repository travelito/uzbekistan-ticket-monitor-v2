create table if not exists public.train_routes (
  id uuid primary key default gen_random_uuid(),
  train_number text not null unique,
  route_stations jsonb not null,
  bidirectional boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint train_routes_route_stations_array_check check (jsonb_typeof(route_stations) = 'array')
);

create index if not exists idx_train_routes_train_number on public.train_routes (train_number);

insert into public.train_routes (train_number, route_stations, bidirectional)
values (
  '752Ж',
  '["Хива", "Бухара", "Самарканд", "Ташкент"]'::jsonb,
  true
)
on conflict (train_number)
do update
set
  route_stations = excluded.route_stations,
  bidirectional = excluded.bidirectional,
  updated_at = now();
