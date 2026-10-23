# Monetary contract and migration plan

## Current contract before migration

- `trips.budget`, `expenses.amount`, `activities.estimate`, `activities.price_per_person`, `destinations.budget_estimate`, and `places.ticket_estimate` are `numeric(12,2)` in the versioned schema.
- API payloads, persistence DTOs, local demo data, and UI inputs represent these values as decimal major units (for example, `12.34`). Expenses and trip budgets reject negative amounts in SQL and validation.
- Each trip, expense, and activity stores its own currency. Budget views select a trip currency and exclude estimates in other currencies rather than applying exchange rates.
- Supported currencies are EUR, USD, GBP, and MAD; each is represented with two decimal places in the current UI.

## Proposed transition

The conversion uses integer minor units in PostgreSQL while keeping the existing JSON/API/UI contract in major units. `toMinorUnits` rounds decimal input to two places using ties away from zero, matching PostgreSQL numeric scale rounding for amounts the application permits. `fromMinorUnits` converts database values back at the API boundary. Arithmetic helpers sum integer minor units and filter by currency.

Migration `20261022000100_money_minor_units.sql` converts each `numeric(12,2)` value to `bigint` by multiplying by 100. The existing precision bounds fit safely in signed 64-bit integers, and multiplying by 100 preserves every stored cent exactly. The migration is idempotent for these columns: it converts only columns still typed `numeric`, and leaves columns already typed `bigint` unchanged. It has not been executed.

The migration and conversion-aware application must be deployed in a coordinated maintenance window; do not apply the migration while an older application version is serving requests. The API continues returning major-unit decimals, preserving existing UI consumers. Demo/local data also remains in major units.

## Consumers

- Trip collection maps budgets, nested expenses, and itinerary estimates between integer storage and major-unit responses.
- Trip creation/update, expense creation/update, activity update, and day replacement convert incoming major-unit payloads to minor units before database writes/RPC calls.
- Client persistence DTOs and UI continue using major units. Monetary aggregation uses integer helpers, and currencies are never added together.
- Catalog cost columns are migrated under the same schema contract. Current catalog content is bundled demo data; future database-backed reads must convert at their service boundary.

## Safety constraints

- Negative amounts remain invalid, matching existing checks and UI controls.
- No exchange-rate conversion or cross-currency addition is performed.
- Review and test the migration against a local database snapshot before production. No values or remote schema have been changed during this implementation.
