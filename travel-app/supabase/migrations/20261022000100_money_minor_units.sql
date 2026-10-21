-- Preserve every numeric(12,2) value while storing money as integer minor units.
-- Conversion-aware application code must be deployed with this schema change.
do $migration$
begin
  if (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'trips' and column_name = 'budget') = 'numeric' then
    alter table public.trips alter column budget type bigint using (budget * 100)::bigint;
  end if;
  if (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'activities' and column_name = 'estimate') = 'numeric' then
    alter table public.activities alter column estimate type bigint using (estimate * 100)::bigint;
  end if;
  if (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'activities' and column_name = 'price_per_person') = 'numeric' then
    alter table public.activities alter column price_per_person type bigint using (price_per_person * 100)::bigint;
  end if;
  if (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'expenses' and column_name = 'amount') = 'numeric' then
    alter table public.expenses alter column amount type bigint using (amount * 100)::bigint;
  end if;
  if (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'destinations' and column_name = 'budget_estimate') = 'numeric' then
    alter table public.destinations alter column budget_estimate type bigint using (budget_estimate * 100)::bigint;
  end if;
  if (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'places' and column_name = 'ticket_estimate') = 'numeric' then
    alter table public.places alter column ticket_estimate type bigint using (ticket_estimate * 100)::bigint;
  end if;
end
$migration$;

notify pgrst, 'reload schema';
