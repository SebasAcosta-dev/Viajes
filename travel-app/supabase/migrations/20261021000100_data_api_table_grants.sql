-- The Data API only exposes public tables when API roles have table privileges.
-- Refuse to grant access to private tables unless their RLS is already enabled.
do $migration$
declare
  unprotected_tables text[];
begin
  select array_agg(required.table_name order by required.table_name)
  into unprotected_tables
  from (values
    ('profiles'),
    ('trips'),
    ('trip_days'),
    ('activities'),
    ('favorites'),
    ('expenses'),
    ('trip_groups'),
    ('trip_group_items'),
    ('destinations'),
    ('places')
  ) as required(table_name)
  left join pg_class as relation
    on relation.oid = to_regclass(format('public.%I', required.table_name))
  where relation.oid is null or not relation.relrowsecurity;

  if unprotected_tables is not null then
    raise exception 'Refusing Data API grants: missing tables or RLS is disabled for %', unprotected_tables;
  end if;

  execute 'grant usage on schema public to authenticated, anon';
  execute 'grant select, update on table public.profiles to authenticated';
  execute 'grant select on table public.destinations, public.places to anon, authenticated';
  execute 'grant select, insert, update, delete on table public.trips, public.trip_days, public.activities, public.expenses to authenticated';
  execute 'grant select, insert, delete on table public.favorites to authenticated';
  execute 'grant select, insert, update, delete on table public.trip_groups, public.trip_group_items to authenticated';
end
$migration$;

notify pgrst, 'reload schema';
