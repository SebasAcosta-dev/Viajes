alter table public.expenses
  add column if not exists notes text not null default '',
  add column if not exists activity_id uuid references public.activities(id) on delete set null;

alter table public.trips
  add constraint trips_id_user_id_unique unique (id, user_id);

alter table public.activities
  drop constraint if exists activities_sort_order_check;
alter table public.activities
  add constraint activities_sort_order_check check (sort_order between 1 and 200);

create table public.trip_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.trip_group_items (
  group_id uuid not null,
  trip_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sort_order integer not null check (sort_order between 1 and 12),
  starts_on date,
  ends_on date,
  primary key (group_id, trip_id),
  unique (group_id, sort_order),
  foreign key (group_id, user_id) references public.trip_groups(id, user_id) on delete cascade,
  foreign key (trip_id, user_id) references public.trips(id, user_id) on delete cascade,
  check (starts_on is null or ends_on is null or ends_on >= starts_on)
);

create index trip_group_items_user_order_idx on public.trip_group_items (user_id, group_id, sort_order);

create trigger trip_groups_updated_at before update on public.trip_groups
for each row execute function public.set_updated_at();

alter table public.trip_groups enable row level security;
alter table public.trip_group_items enable row level security;

create policy "trip_groups_select_own" on public.trip_groups
  for select to authenticated using (user_id = (select auth.uid()));
create policy "trip_groups_insert_own" on public.trip_groups
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "trip_groups_update_own" on public.trip_groups
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "trip_groups_delete_own" on public.trip_groups
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "trip_group_items_select_own" on public.trip_group_items
  for select to authenticated using (user_id = (select auth.uid()));
create policy "trip_group_items_insert_own" on public.trip_group_items
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.trip_groups where id = group_id and user_id = (select auth.uid()))
    and exists (select 1 from public.trips where id = trip_id and user_id = (select auth.uid()))
  );
create policy "trip_group_items_update_own" on public.trip_group_items
  for update to authenticated using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.trip_groups where id = group_id and user_id = (select auth.uid()))
    and exists (select 1 from public.trips where id = trip_id and user_id = (select auth.uid()))
  );
create policy "trip_group_items_delete_own" on public.trip_group_items
  for delete to authenticated using (user_id = (select auth.uid()));

create or replace function public.update_trip_details(p_trip_id uuid, p_changes jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  updated_id uuid;
  next_start date;
  next_end date;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  update public.trips
  set name = coalesce(p_changes ->> 'name', name),
      origin = coalesce(p_changes ->> 'origin', origin),
      destination = coalesce(p_changes ->> 'destination', destination),
      travelers = coalesce((p_changes ->> 'travelers')::integer, travelers),
      budget = coalesce((p_changes ->> 'budget')::numeric, budget),
      currency = coalesce(p_changes ->> 'currency', currency),
      status = coalesce(p_changes ->> 'status', status),
      start_date = case when p_changes ? 'startDate' then nullif(p_changes ->> 'startDate', '')::date else start_date end,
      end_date = case when p_changes ? 'endDate' then nullif(p_changes ->> 'endDate', '')::date else end_date end
  where id = p_trip_id and user_id = auth.uid()
  returning id, start_date, end_date into updated_id, next_start, next_end;

  if updated_id is null then
    return null;
  end if;
  if next_start is not null and next_end is not null and next_end < next_start then
    raise exception 'invalid_trip_dates' using errcode = '22007';
  end if;
  if p_changes ? 'startDate' then
    update public.trip_days
    set date = case when next_start is null then null else next_start + (day_number - 1) end
    where trip_id = p_trip_id and user_id = auth.uid();
  end if;
  return updated_id;
end;
$$;

create or replace function public.create_trip_group(
  p_name text,
  p_trip_ids uuid[],
  p_starts_on date[],
  p_ends_on date[]
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  new_group_id uuid;
  selected_count integer;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_name is null or length(trim(p_name)) not between 1 and 160
     or coalesce(array_length(p_trip_ids, 1), 0) not between 1 and 12
     or array_length(p_starts_on, 1) is distinct from array_length(p_trip_ids, 1)
     or array_length(p_ends_on, 1) is distinct from array_length(p_trip_ids, 1)
     or (select count(distinct selected.trip_id) from unnest(p_trip_ids) as selected(trip_id)) <> array_length(p_trip_ids, 1) then
    raise exception 'invalid_trip_group' using errcode = '22023';
  end if;

  select count(*) into selected_count from public.trips
  where id = any(p_trip_ids) and user_id = auth.uid();
  if selected_count <> array_length(p_trip_ids, 1) then
    raise exception 'trip_group_access_denied' using errcode = '42501';
  end if;

  if exists (
    select 1 from unnest(p_starts_on, p_ends_on) as dates(starts_on, ends_on)
    where starts_on is not null and ends_on is not null and ends_on < starts_on
  ) then
    raise exception 'invalid_trip_group_dates' using errcode = '22007';
  end if;

  insert into public.trip_groups (user_id, name) values (auth.uid(), trim(p_name))
  returning id into new_group_id;
  insert into public.trip_group_items (group_id, trip_id, user_id, sort_order, starts_on, ends_on)
  select new_group_id, selected.trip_id, auth.uid(), selected.ordinality::integer, selected.starts_on, selected.ends_on
  from unnest(p_trip_ids, p_starts_on, p_ends_on) with ordinality
    as selected(trip_id, starts_on, ends_on, ordinality);
  return new_group_id;
end;
$$;

create or replace function public.reorder_trip_day_activities(
  p_trip_id uuid,
  p_day_id uuid,
  p_activity_ids uuid[]
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  activity_count integer;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.trip_days
    where id = p_day_id and trip_id = p_trip_id and user_id = auth.uid()
  ) then
    raise exception 'trip_day_not_found' using errcode = '42501';
  end if;
  select count(*) into activity_count from public.activities
  where trip_id = p_trip_id and day_id = p_day_id and user_id = auth.uid();
  if activity_count <> coalesce(array_length(p_activity_ids, 1), 0)
     or activity_count > 12
     or (select count(distinct selected.activity_id) from unnest(p_activity_ids) as selected(activity_id)) <> activity_count
     or exists (
       select 1 from unnest(p_activity_ids) as selected(activity_id)
       where not exists (
         select 1 from public.activities
         where id = selected.activity_id and trip_id = p_trip_id and day_id = p_day_id and user_id = auth.uid()
       )
     ) then
    raise exception 'invalid_activity_order' using errcode = '22023';
  end if;
  update public.activities
  set sort_order = sort_order + 100
  where trip_id = p_trip_id and day_id = p_day_id and user_id = auth.uid();
  update public.activities as activity
  set sort_order = selected.ordinality::integer
  from unnest(p_activity_ids) with ordinality as selected(activity_id, ordinality)
  where activity.id = selected.activity_id and activity.trip_id = p_trip_id and activity.day_id = p_day_id;
  return true;
end;
$$;

create or replace function public.replace_trip_day(
  p_trip_id uuid,
  p_day_number integer,
  p_day jsonb
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  current_day_id uuid;
  day_date date;
  old_expense_links jsonb;
  activity_payload jsonb;
  new_activity_id uuid;
  activity_name text;
  new_activity_name_count integer;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  select id, date into current_day_id, day_date
  from public.trip_days
  where trip_id = p_trip_id and day_number = p_day_number and user_id = auth.uid()
  for update;
  if current_day_id is null then
    raise exception 'trip_day_not_found' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'activity_name', lower(trim(activity.name)),
    'old_activity_count', (
      select count(*)
      from public.activities as same_name
      where same_name.trip_id = p_trip_id
        and same_name.day_id = current_day_id
        and same_name.user_id = auth.uid()
        and lower(trim(same_name.name)) = lower(trim(activity.name))
    ),
    'expense_ids', (
      select coalesce(jsonb_agg(expense.id), '[]'::jsonb)
      from public.expenses as expense
      where expense.activity_id = activity.id
        and expense.trip_id = p_trip_id
        and expense.user_id = auth.uid()
    )
  )), '[]'::jsonb) into old_expense_links
  from public.activities as activity
  where activity.trip_id = p_trip_id
    and activity.day_id = current_day_id
    and activity.user_id = auth.uid()
    and exists (
      select 1
      from public.expenses as expense
      where expense.activity_id = activity.id
        and expense.trip_id = p_trip_id
        and expense.user_id = auth.uid()
    );

  update public.trip_days
  set theme = p_day ->> 'theme',
      summary = coalesce(p_day ->> 'summary', '')
  where id = current_day_id and user_id = auth.uid();
  delete from public.activities
  where day_id = current_day_id and trip_id = p_trip_id and user_id = auth.uid();

  for activity_payload in select value from jsonb_array_elements(p_day -> 'items')
  loop
    activity_name := lower(trim(activity_payload ->> 'name'));
    select count(*) into new_activity_name_count
    from jsonb_array_elements(p_day -> 'items') as new_activity(value)
    where lower(trim(new_activity.value ->> 'name')) = activity_name;

    insert into public.activities (
      trip_id, day_id, user_id, name, description, start_time, end_time,
      duration_minutes, estimate, currency, sort_order, latitude, longitude,
      notes, source, price_per_person, price_status, price_source,
      price_checked_at, interest_tags, budget_category,
      block_type, location_label, travel_minutes, data_reliability
    ) values (
      p_trip_id,
      current_day_id,
      auth.uid(),
      activity_payload ->> 'name',
      coalesce(activity_payload ->> 'description', ''),
      nullif(activity_payload ->> 'startTime', '')::time,
      nullif(activity_payload ->> 'endTime', '')::time,
      (activity_payload ->> 'durationMinutes')::integer,
      nullif(activity_payload ->> 'estimate', '')::numeric,
      activity_payload ->> 'currency',
      (activity_payload ->> 'order')::integer,
      nullif(activity_payload ->> 'lat', '')::double precision,
      nullif(activity_payload ->> 'lng', '')::double precision,
      coalesce(activity_payload ->> 'notes', ''),
      coalesce(activity_payload ->> 'source', 'orientativo'),
      nullif(activity_payload ->> 'pricePerPerson', '')::numeric,
      coalesce(activity_payload ->> 'priceStatus', 'unknown'),
      nullif(activity_payload ->> 'priceSource', ''),
      nullif(activity_payload ->> 'priceCheckedAt', '')::timestamptz,
      coalesce(array(select jsonb_array_elements_text(activity_payload -> 'interestTags')), '{}'),
      coalesce(activity_payload ->> 'budgetCategory', 'activity'),
      coalesce(activity_payload ->> 'blockType', 'activity'),
      nullif(activity_payload ->> 'location', ''),
      nullif(activity_payload ->> 'travelMinutes', '')::integer,
      coalesce(activity_payload ->> 'reliability', 'unknown')
    ) returning id into new_activity_id;

    if new_activity_name_count = 1 then
      update public.expenses as expense
      set activity_id = new_activity_id
      where expense.trip_id = p_trip_id
        and expense.user_id = auth.uid()
        and expense.activity_id is null
        and exists (
          select 1
          from jsonb_array_elements(old_expense_links) as old_activity(value)
          cross join lateral jsonb_array_elements_text(old_activity.value -> 'expense_ids') as linked_expense(expense_id)
          where old_activity.value ->> 'activity_name' = activity_name
            and (old_activity.value ->> 'old_activity_count')::integer = 1
            and expense.id = linked_expense.expense_id::uuid
        );
    end if;
  end loop;
  return true;
end;
$$;

revoke all on function public.update_trip_details(uuid, jsonb) from public;
revoke all on function public.create_trip_group(text, uuid[], date[], date[]) from public;
revoke all on function public.reorder_trip_day_activities(uuid, uuid, uuid[]) from public;
revoke all on function public.replace_trip_day(uuid, integer, jsonb) from public;
grant execute on function public.update_trip_details(uuid, jsonb) to authenticated;
grant execute on function public.create_trip_group(text, uuid[], date[], date[]) to authenticated;
grant execute on function public.reorder_trip_day_activities(uuid, uuid, uuid[]) to authenticated;
grant execute on function public.replace_trip_day(uuid, integer, jsonb) to authenticated;
