alter table public.activities
  add column price_per_person numeric(12, 2) check (price_per_person is null or price_per_person >= 0),
  add column price_status text not null default 'unknown'
    check (price_status in ('verified', 'estimate', 'unknown', 'free_verified')),
  add column price_source text,
  add column price_checked_at timestamptz,
  add column interest_tags text[] not null default '{}',
  add column budget_category text not null default 'activity'
    check (budget_category in ('activity', 'gastronomy'));

update public.activities
set price_status = case when estimate is null or estimate = 0 then 'unknown' else 'estimate' end;

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
        duration_minutes, estimate, currency, sort_order, latitude, longitude,
        notes, source, price_per_person, price_status, price_source,
        price_checked_at, interest_tags, budget_category
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
        coalesce(activity_payload ->> 'source', 'orientativo'),
        nullif(activity_payload ->> 'pricePerPerson', '')::numeric,
        coalesce(activity_payload ->> 'priceStatus', 'unknown'),
        nullif(activity_payload ->> 'priceSource', ''),
        nullif(activity_payload ->> 'priceCheckedAt', '')::timestamptz,
        coalesce(array(select jsonb_array_elements_text(activity_payload -> 'interestTags')), '{}'),
        coalesce(activity_payload ->> 'budgetCategory', 'activity')
      );
    end loop;
  end loop;
  return new_trip_id;
end;
$$;

grant execute on function public.create_trip_with_itinerary(jsonb) to authenticated;
