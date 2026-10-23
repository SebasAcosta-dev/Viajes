-- Add the currencies offered by the application while preserving existing values.
-- The previous currency checks allowed only EUR, USD, GBP, and MAD; all remain valid.
alter table public.profiles drop constraint if exists profiles_currency_check;
alter table public.profiles
  add constraint profiles_currency_check
  check (currency in ('EUR', 'MAD', 'COP', 'USD', 'GBP', 'CHF', 'MXN', 'ARS', 'CLP', 'PEN', 'BRL', 'CAD', 'AUD', 'JPY'));

alter table public.places drop constraint if exists places_currency_check;
alter table public.places
  add constraint places_currency_check
  check (currency in ('EUR', 'MAD', 'COP', 'USD', 'GBP', 'CHF', 'MXN', 'ARS', 'CLP', 'PEN', 'BRL', 'CAD', 'AUD', 'JPY'));

alter table public.trips drop constraint if exists trips_currency_check;
alter table public.trips
  add constraint trips_currency_check
  check (currency in ('EUR', 'MAD', 'COP', 'USD', 'GBP', 'CHF', 'MXN', 'ARS', 'CLP', 'PEN', 'BRL', 'CAD', 'AUD', 'JPY'));

alter table public.activities drop constraint if exists activities_currency_check;
alter table public.activities
  add constraint activities_currency_check
  check (currency in ('EUR', 'MAD', 'COP', 'USD', 'GBP', 'CHF', 'MXN', 'ARS', 'CLP', 'PEN', 'BRL', 'CAD', 'AUD', 'JPY'));

alter table public.expenses drop constraint if exists expenses_currency_check;
alter table public.expenses
  add constraint expenses_currency_check
  check (currency in ('EUR', 'MAD', 'COP', 'USD', 'GBP', 'CHF', 'MXN', 'ARS', 'CLP', 'PEN', 'BRL', 'CAD', 'AUD', 'JPY'));
