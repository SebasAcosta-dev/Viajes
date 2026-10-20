create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  preferences jsonb not null default '{}'::jsonb,
  currency text not null default 'EUR' check (currency in ('EUR', 'USD', 'GBP', 'MAD')),
  language text not null default 'es',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.destinations (
  slug text primary key,
  name text not null,
  country text not null,
  region text not null default '',
  description text not null default '',
  latitude double precision,
  longitude double precision,
  categories text[] not null default '{}',
  best_season text not null default '',
  recommended_duration text not null default '',
  budget_estimate numeric(12, 2) check (budget_estimate is null or budget_estimate >= 0),
  image_url text,
  source_label text not null default 'Información orientativa',
  updated_at timestamptz not null default now(),
  check (latitude is null or latitude between -90 and 90),
  check (longitude is null or longitude between -180 and 180)
);

create table public.places (
  id text primary key,
  destination_slug text not null references public.destinations(slug) on delete cascade,
  name text not null,
  description text not null default '',
  category text not null default '',
  latitude double precision,
  longitude double precision,
  address text not null default '',
  ticket_estimate numeric(12, 2) check (ticket_estimate is null or ticket_estimate >= 0),
  currency text not null default 'EUR' check (currency in ('EUR', 'USD', 'GBP', 'MAD')),
  visit_minutes integer check (visit_minutes is null or visit_minutes > 0),
  source text not null default 'Orientativo',
  updated_at timestamptz not null default now(),
  check (latitude is null or latitude between -90 and 90),
  check (longitude is null or longitude between -180 and 180)
);

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 160),
  origin text not null default '',
  destination text not null check (length(trim(destination)) between 1 and 160),
  start_date date,
  end_date date,
  travelers integer not null default 1 check (travelers between 1 and 100),
  budget numeric(12, 2) not null check (budget >= 0),
  currency text not null check (currency in ('EUR', 'USD', 'GBP', 'MAD')),
  interests text[] not null default '{}',
  travel_type text not null default 'Combinado',
  status text not null default 'borrador' check (status in ('borrador', 'planificado', 'activo', 'completado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_date is null or end_date is null or end_date >= start_date)
);

create table public.trip_days (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day_number integer not null check (day_number between 1 and 30),
  date date,
  theme text not null check (length(trim(theme)) between 1 and 160),
  summary text not null default '',
  created_at timestamptz not null default now(),
  unique (trip_id, day_number)
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  day_id uuid not null references public.trip_days(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 200),
  description text not null default '',
  start_time time,
  end_time time,
  duration_minutes integer not null check (duration_minutes between 1 and 1440),
  estimate numeric(12, 2) check (estimate is null or estimate >= 0),
  currency text not null check (currency in ('EUR', 'USD', 'GBP', 'MAD')),
  sort_order integer not null check (sort_order between 1 and 100),
  latitude double precision,
  longitude double precision,
  notes text not null default '',
  source text not null default 'orientativo' check (source in ('verificado', 'orientativo', 'desconocido')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_time is null or end_time is null or end_time > start_time),
  check (latitude is null or latitude between -90 and 90),
  check (longitude is null or longitude between -180 and 180),
  unique (day_id, sort_order)
);

create table public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  destination_slug text not null references public.destinations(slug) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, destination_slug)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category text not null check (length(trim(category)) between 1 and 80),
  description text not null check (length(trim(description)) between 1 and 240),
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null check (currency in ('EUR', 'USD', 'GBP', 'MAD')),
  incurred_on date not null default current_date,
  created_at timestamptz not null default now()
);

create index trips_user_updated_idx on public.trips (user_id, updated_at desc);
create index trip_days_trip_order_idx on public.trip_days (trip_id, day_number);
create index activities_trip_order_idx on public.activities (trip_id, day_id, sort_order);
create index favorites_user_created_idx on public.favorites (user_id, created_at desc);
create index expenses_trip_date_idx on public.expenses (trip_id, incurred_on desc);
create index places_destination_idx on public.places (destination_slug);

create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger trips_updated_at before update on public.trips
for each row execute function public.set_updated_at();
create trigger activities_updated_at before update on public.activities
for each row execute function public.set_updated_at();

create or replace function public.create_profile_for_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger auth_user_profile after insert on auth.users
for each row execute function public.create_profile_for_user();

create or replace function public.create_trip_with_itinerary(trip_payload jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  new_trip_id uuid;
  day_payload jsonb;
  activity_payload jsonb;
  new_day_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  insert into public.trips (
    user_id, name, origin, destination, start_date, end_date, travelers,
    budget, currency, interests, travel_type, status
  ) values (
    auth.uid(),
    trip_payload ->> 'name',
    coalesce(trip_payload ->> 'origin', ''),
    trip_payload ->> 'destination',
    nullif(trip_payload ->> 'startDate', '')::date,
    nullif(trip_payload ->> 'endDate', '')::date,
    coalesce((trip_payload ->> 'travelers')::integer, 1),
    (trip_payload ->> 'budget')::numeric,
    trip_payload ->> 'currency',
    coalesce(array(select jsonb_array_elements_text(trip_payload -> 'interests')), '{}'),
    coalesce(trip_payload ->> 'travelType', 'Combinado'),
    coalesce(trip_payload ->> 'status', 'borrador')
  ) returning id into new_trip_id;

  for day_payload in select value from jsonb_array_elements(trip_payload -> 'itinerary')
  loop
    insert into public.trip_days (trip_id, user_id, day_number, date, theme, summary)
    values (
      new_trip_id,
      auth.uid(),
      (day_payload ->> 'dayNumber')::integer,
      nullif(day_payload ->> 'date', '')::date,
      day_payload ->> 'theme',
      coalesce(day_payload ->> 'summary', '')
    ) returning id into new_day_id;

    for activity_payload in select value from jsonb_array_elements(day_payload -> 'items')
    loop
      insert into public.activities (
        trip_id, day_id, user_id, name, description, start_time, end_time,
        duration_minutes, estimate, currency, sort_order, latitude, longitude, notes, source
      ) values (
        new_trip_id,
        new_day_id,
        auth.uid(),
        activity_payload ->> 'name',
        coalesce(activity_payload ->> 'description', ''),
        nullif(activity_payload ->> 'startTime', '')::time,
        nullif(activity_payload ->> 'endTime', '')::time,
        (activity_payload ->> 'durationMinutes')::integer,
        nullif(activity_payload ->> 'estimate', '')::numeric,
        activity_payload ->> 'currency',
        coalesce((activity_payload ->> 'order')::integer, 1),
        nullif(activity_payload ->> 'lat', '')::double precision,
        nullif(activity_payload ->> 'lng', '')::double precision,
        coalesce(activity_payload ->> 'notes', ''),
        coalesce(activity_payload ->> 'source', 'orientativo')
      );
    end loop;
  end loop;
  return new_trip_id;
end;
$$;

grant execute on function public.create_trip_with_itinerary(jsonb) to authenticated;

alter table public.profiles enable row level security;
alter table public.destinations enable row level security;
alter table public.places enable row level security;
alter table public.trips enable row level security;
alter table public.trip_days enable row level security;
alter table public.activities enable row level security;
alter table public.favorites enable row level security;
alter table public.expenses enable row level security;

create policy "profiles_select_own" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "profiles_update_own" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "destinations_read_public" on public.destinations for select to anon, authenticated using (true);
create policy "places_read_public" on public.places for select to anon, authenticated using (true);

create policy "trips_select_own" on public.trips for select to authenticated using (user_id = (select auth.uid()));
create policy "trips_insert_own" on public.trips for insert to authenticated with check (user_id = (select auth.uid()));
create policy "trips_update_own" on public.trips for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "trips_delete_own" on public.trips for delete to authenticated using (user_id = (select auth.uid()));

create policy "trip_days_select_own" on public.trip_days for select to authenticated using (
  user_id = (select auth.uid()) and exists (
    select 1 from public.trips where trips.id = trip_days.trip_id and trips.user_id = (select auth.uid())
  )
);
create policy "trip_days_insert_own" on public.trip_days for insert to authenticated with check (
  user_id = (select auth.uid()) and exists (
    select 1 from public.trips where trips.id = trip_days.trip_id and trips.user_id = (select auth.uid())
  )
);
create policy "trip_days_update_own" on public.trip_days for update to authenticated using (
  user_id = (select auth.uid()) and exists (
    select 1 from public.trips where trips.id = trip_days.trip_id and trips.user_id = (select auth.uid())
  )
) with check (
  user_id = (select auth.uid()) and exists (
    select 1 from public.trips where trips.id = trip_days.trip_id and trips.user_id = (select auth.uid())
  )
);
create policy "trip_days_delete_own" on public.trip_days for delete to authenticated using (user_id = (select auth.uid()));

create policy "activities_select_own" on public.activities for select to authenticated using (
  user_id = (select auth.uid()) and exists (
    select 1 from public.trips where trips.id = activities.trip_id and trips.user_id = (select auth.uid())
  )
);
create policy "activities_insert_own" on public.activities for insert to authenticated with check (
  user_id = (select auth.uid()) and exists (
    select 1 from public.trips
    join public.trip_days on trip_days.trip_id = trips.id
    where trips.id = activities.trip_id and trip_days.id = activities.day_id and trips.user_id = (select auth.uid())
  )
);
create policy "activities_update_own" on public.activities for update to authenticated using (
  user_id = (select auth.uid()) and exists (
    select 1 from public.trips where trips.id = activities.trip_id and trips.user_id = (select auth.uid())
  )
) with check (
  user_id = (select auth.uid()) and exists (
    select 1 from public.trips
    join public.trip_days on trip_days.trip_id = trips.id
    where trips.id = activities.trip_id and trip_days.id = activities.day_id and trips.user_id = (select auth.uid())
  )
);
create policy "activities_delete_own" on public.activities for delete to authenticated using (user_id = (select auth.uid()));

create policy "favorites_select_own" on public.favorites for select to authenticated using (user_id = (select auth.uid()));
create policy "favorites_insert_own" on public.favorites for insert to authenticated with check (user_id = (select auth.uid()));
create policy "favorites_delete_own" on public.favorites for delete to authenticated using (user_id = (select auth.uid()));

create policy "expenses_select_own" on public.expenses for select to authenticated using (user_id = (select auth.uid()));
create policy "expenses_insert_own" on public.expenses for insert to authenticated with check (
  user_id = (select auth.uid()) and exists (
    select 1 from public.trips where trips.id = expenses.trip_id and trips.user_id = (select auth.uid())
  )
);
create policy "expenses_update_own" on public.expenses for update to authenticated using (user_id = (select auth.uid())) with check (
  user_id = (select auth.uid()) and exists (
    select 1 from public.trips where trips.id = expenses.trip_id and trips.user_id = (select auth.uid())
  )
);
create policy "expenses_delete_own" on public.expenses for delete to authenticated using (user_id = (select auth.uid()));

insert into public.destinations (slug, name, country, region, description, source_label) values
  ('marrakech', 'Marrakech', 'Marruecos', 'Marrakech-Safi', 'Ciudad imperial con zocos, riads y patrimonio histórico.', 'Datos locales orientativos'),
  ('fez', 'Fez', 'Marruecos', 'Fès-Meknès', 'Ciudad histórica con medinas y patrimonio artesanal.', 'Datos locales orientativos'),
  ('budapest', 'Budapest', 'Hungría', 'Hungría central', 'Capital con baños termales, arquitectura y vida cultural.', 'Datos locales orientativos'),
  ('barcelona', 'Barcelona', 'España', 'Cataluña', 'Ciudad costera con arquitectura, mercados y cultura.', 'Datos locales orientativos'),
  ('bucarest', 'Bucarest', 'Rumanía', 'Moldavia', 'Capital con historia reciente y arquitectura monumental.', 'Datos locales orientativos'),
  ('estambul', 'Estambul', 'Turquía', 'Mármara', 'Ciudad entre continentes con patrimonio histórico.', 'Datos locales orientativos'),
  ('brasov', 'Brașov', 'Rumanía', 'Transilvania', 'Ciudad histórica rodeada por los Cárpatos.', 'Datos locales orientativos'),
  ('tirana', 'Tirana', 'Albania', 'Tirana', 'Capital con historia, cultura y vida urbana.', 'Datos locales orientativos')
on conflict (slug) do nothing;

insert into public.places (id, destination_slug, name, category, source) values
  ('place-jemaa', 'marrakech', 'Plaza Jemaa el-Fnaa', 'Plaza', 'Datos locales orientativos'),
  ('place-palacio', 'marrakech', 'Palacio de Bahia', 'Monumento', 'Datos locales orientativos'),
  ('place-medina-fez', 'fez', 'Medina de Fez', 'Barrio histórico', 'Datos locales orientativos'),
  ('place-bath', 'budapest', 'Baños Széchenyi', 'Baños termales', 'Datos locales orientativos'),
  ('place-sagrada', 'barcelona', 'Sagrada Familia', 'Monumento', 'Datos locales orientativos'),
  ('place-revolution', 'bucarest', 'Piața Revoluției', 'Plaza', 'Datos locales orientativos'),
  ('place-sultanahmet', 'estambul', 'Sultanahmet', 'Barrio histórico', 'Datos locales orientativos'),
  ('place-black-church', 'brasov', 'Iglesia Negra', 'Monumento', 'Datos locales orientativos'),
  ('place-pyramid', 'tirana', 'Pirámide de Tirana', 'Monumento', 'Datos locales orientativos')
on conflict (id) do nothing;
