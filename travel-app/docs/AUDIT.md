# Auditoría de arquitectura — Viajes

**Fase:** 0 (solo auditoría). **Fecha:** 2026-10-21.

## Alcance y límites

Inspección estática del árbol, rutas, clientes Supabase, APIs, migraciones versionadas, referencias de configuración y cambios Git locales. No se leyeron valores de `.env.local` ni de otros archivos `.env`; tampoco se consultaron Vercel o la base remota. Por tanto, este documento describe el código versionado, no acredita el estado desplegado ni el esquema real de producción. El inventario de dependencias se basa en referencias del código, no en un análisis dinámico de paquetes.

## Git al iniciar la auditoría

Rama `main`, alineada según Git con `origin/main`; no se hizo fetch ni se verificó el remoto. Cambios preexistentes:

| Estado | Ruta | Observación |
|---|---|---|
| Modificado | `README.md` | Añadida documentación de confirmación de correo Supabase; se conserva. |
| Modificado | `app/lib/persistence/server.ts` | Diagnóstico PGRST205 y registro seguro de host; se conserva. |
| Modificado | `app/lib/persistence/server.test.ts` | Pruebas para el diagnóstico y la migración de permisos; se conserva. |
| Sin seguimiento | `supabase/migrations/20261021000100_data_api_table_grants.sql` | Migración de privilegios Data API con comprobación previa de RLS; se conserva. |

No se restauró, descartó ni editó ninguno de estos cambios. `.env.local` existe en el directorio y está excluido por `.gitignore` (`.env*`); solo se comprobó su presencia y la regla de exclusión, nunca su contenido. Esta auditoría añade únicamente este documento.

## Árbol efectivo (resumen)

```text
travel-app/
├── app/
│   ├── api/                 # handlers REST y callback de Auth
│   ├── calendario/          # página calendario
│   ├── components/          # navegación, formularios, mapa, viajes y preferencias
│   ├── cuenta/              # autenticación, preferencias y acceso a cuenta
│   ├── destinos/            # exploración de destinos
│   ├── favoritos/           # favoritos
│   ├── ia/                  # asistente
│   ├── itinerario/          # vista/edición de itinerario
│   ├── mapa/                # mapa
│   ├── perfil/              # perfil
│   ├── planificar/          # planificación
│   ├── presupuesto/         # presupuesto
│   ├── viajes/              # mis viajes/calendario de viajes
│   ├── lib/                 # persistencia, Supabase, dominio, fechas, IA
│   ├── data/                # datos de demo
│   ├── layout.tsx           # monta SiteNavigation global
│   └── page.tsx             # Inicio
├── supabase/migrations/     # esquema, itinerarios, gestión y permisos Data API
├── docs/AUDIT.md
└── package.json
```

### Rutas de interfaz que existen

`/`, `/viajes`, `/mapa`, `/presupuesto`, `/cuenta`, `/calendario`, `/destinos`, `/favoritos`, `/ia`, `/itinerario`, `/perfil` y `/planificar`.

No hay `app/assistant/page.tsx`, por lo que `/assistant` no es una ruta de interfaz presente. Sí existe `/api/assistant` como endpoint. Las páginas `/perfil`, `/calendario`, `/destinos`, `/favoritos`, `/ia`, `/itinerario` y `/planificar` no son rutas duplicadas por sí mismas; varias son destinos secundarios que conviven con el menú principal. El menú definido en `app/components/site-navigation.tsx`, montado desde `app/layout.tsx`, contiene una sola lista de cinco opciones: Inicio, Mis viajes, Mapa, Presupuesto y Cuenta. El calendario también tiene página propia y componentes usados desde el área de viajes; su pertenencia como funcionalidad secundaria debe preservarse al reorganizar.

## Endpoints API presentes

Todos los endpoints listados son Route Handlers de App Router. Salvo donde se indica, los handlers de persistencia llaman `getAuthenticatedSupabase()`, que crea cliente server-side desde cookies y verifica la identidad mediante `supabase.auth.getUser()`. No usa `getSession()` para autorizar. Hay validación de payload en distintos grados; revisar consistencia y formato en la fase de implementación.

| Endpoint | Métodos | Acceso/validación observada |
|---|---|---|
| `/api/assistant` | POST | No exige sesión Supabase. Valida mensaje, fecha y contexto antes del proveedor de IA. Revisar límites de abuso/coste y tamaño del cuerpo. |
| `/api/auth/callback` | GET | Intercambia código/token de confirmación y establece sesión por cookies. |
| `/api/favorites` | GET, POST | Sesión requerida; valida campos de alta y consulta destinos/favoritos del usuario. |
| `/api/favorites/[favoriteId]` | DELETE | Sesión requerida; elimina con filtros de propiedad. |
| `/api/profile` | GET, PUT | Sesión requerida; PUT valida preferencias. |
| `/api/trip-groups` | GET, POST | Sesión requerida; POST valida datos y llama RPC. |
| `/api/trips` | GET, POST | Sesión requerida; POST valida borrador y llama RPC `create_trip_with_itinerary`. GET puede incluir resúmenes. |
| `/api/trips/[tripId]` | PATCH, DELETE | Sesión requerida; cambios parciales/RPC y filtros por usuario. |
| `/api/trips/[tripId]/activities/[activityId]` | PATCH | Sesión requerida; valida cambios de actividad y filtra por viaje/usuario. |
| `/api/trips/[tripId]/days/[day]/activities/reorder` | POST | Sesión requerida; valida lista y llama RPC `reorder_trip_day_activities`. |
| `/api/trips/[tripId]/days/[day]/regenerate` | POST | Sesión requerida; valida borrador/fecha/día y llama RPC `replace_trip_day`. |
| `/api/trips/[tripId]/expenses` | POST | Sesión requerida; valida gasto y propiedad de actividad relacionada. |
| `/api/trips/[tripId]/expenses/[expenseId]` | PATCH, DELETE | Sesión requerida; valida gasto y filtros de propietario. |

No se encontró uso de `service_role` en el código `app`. La ruta de asistente es la excepción clara a la autenticación de persistencia; que no use Supabase no implica por sí solo una vulnerabilidad, pero requiere decisión explícita sobre cuota/rate limiting si se habilita un proveedor de pago.

## Flujo de clientes y persistencia

- `app/lib/supabase/browser.ts`: crea un singleton con `createBrowserClient` (`@supabase/ssr`) usando las variables públicas URL y publishable key. Es el cliente usado para Auth en `/cuenta` y resolución del usuario en preferencias.
- `app/lib/supabase/server.ts`: crea cliente por solicitud con `createServerClient`, cookies de `next/headers`, la misma URL y la misma clave publishable. No se encontró una clave privilegiada en este flujo.
- `app/lib/persistence/server.ts`: comprueba `NEXT_PUBLIC_DATA_MODE=supabase`, obtiene cliente server, llama `auth.getUser()` y devuelve `{ supabase, user }`; centraliza respuestas de error. Al registrar PGRST205, conserva código/esquema/tabla y, para ese código, solo el hostname configurado, sin valor de clave ni URL completa.
- `app/lib/persistence/client.ts`: fachada cliente para viajes, gastos, favoritos y grupos. En modo Supabase llama las APIs `/api/...`; en demo/visitante conserva persistencia local. `profile-client.ts` maneja preferencias y scope del borrador.
- Las APIs ejecutan las lecturas/escrituras con el cliente autenticado y especifican `user_id` o filtros que acotan propiedad. La seguridad efectiva sigue dependiendo de RLS y privilegios de la base; el código local no demuestra su estado remoto.

### Variables referenciadas (nombres solamente)

`NEXT_PUBLIC_DATA_MODE`, `NEXT_PUBLIC_APP_MODE`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_VERCEL_ENV`, `NEXT_PUBLIC_VERCEL_URL`, `NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL`, `AI_API_KEY`, `AI_PROVIDER`, `AI_MODEL`, `NODE_ENV`.

Los nombres `NEXT_PUBLIC_*` aparecen en código que Next compila para cliente y deben contener solo valores concebidos para exposición pública; `AI_API_KEY` se lee desde el código de servidor del asistente y no debe tener prefijo `NEXT_PUBLIC_`. No se inspeccionaron valores, targets ni configuración de Vercel. `app/lib/supabase.ts` exporta `appMode` y `getSupabaseConfig()`, pero la búsqueda de referencias de código no encontró consumidores: candidato a módulo legado sin uso, no evidencia de un segundo cliente activo. Confirmar antes de eliminarlo.

## SQL y seguridad

- `20261019000100_initial_schema.sql` crea perfiles, catálogos, viajes, días, actividades, favoritos y gastos; establece RLS y políticas de propietario para datos privados, lectura pública de destinos/lugares y RPC de creación de viaje.
- `20261020000200_itinerary_activity_metadata.sql` y `20261020000300_itinerary_schedule.sql` amplían/redefinen `create_trip_with_itinerary(jsonb)` para almacenar campos de actividad y programación. La función asigna `auth.uid()` a las filas; el endpoint de alta invoca esa firma con argumento `{ trip_payload: ... }` según el nombre del parámetro SQL.
- `20261020000400_trip_management.sql` crea grupos/elementos de viaje con RLS y políticas por usuario; define `update_trip_details(uuid,jsonb)`, `create_trip_group(text,uuid[],date[],date[])`, `reorder_trip_day_activities(uuid,uuid,uuid[])` y `replace_trip_day(uuid,integer,jsonb)` con permisos execute para `authenticated`. También añade columnas/restricciones de gastos y restricciones únicas/orden.
- `20261021000100_data_api_table_grants.sql` —cambio preexistente sin seguimiento— comprueba existencia y RLS habilitado antes de conceder privilegios de tabla y solicita recarga del esquema PostgREST. No se ejecutó. El guard no sustituye revisar políticas, y el archivo no demuestra aplicación remota.

En el conjunto de migraciones auditado, las tablas creadas por SQL tienen `ENABLE ROW LEVEL SECURITY`; los grants a roles API deben revisarse junto con esas políticas. No hay evidencia en esta auditoría sobre RLS, permisos, funciones o caché actuales de producción. En particular, el historial SQL no es prueba de migraciones aplicadas remotamente.

## Duplicación y dependencias

- **Configuración Supabase duplicada/obsoleta:** `app/lib/supabase.ts` repite lectura y validación de variables frente a los constructores browser/server y parece no tener consumidores. Mantener una única fuente de construcción y retirar el helper solo tras validar referencias en la fase aprobada.
- **Errores API:** la mayoría comparte `persistenceErrorResponse`, mientras `/api/assistant` aplica su propio mapeo de proveedor. Es una separación razonable; revisar que los endpoints no pierdan códigos técnicos en sus `catch`.
- **Validación de fechas/contexto:** el endpoint assistant declara un validador ISO propio; persistencia usa `app/lib/persistence/validation.ts` y `app/lib/trip-dates.ts`. Puede haber reglas de dominio que se repiten, pero no deben fusionarse sin conservar diferencias de producto.
- **Dependencias:** las dependencias de mapa (`leaflet`, `react-leaflet`, `@types/leaflet`), Markdown (`react-markdown`, `remark-gfm`) y Supabase aparecen referenciadas en código. No se detectó candidato obvio a dependencia runtime sin uso a partir de esta búsqueda. Confirmar con análisis dedicado antes de quitar paquetes.

## Diagnóstico de seguridad basado en el código

1. **Autenticación:** endpoints privados usan verificación `getUser()` desde cliente server/cookies. No se encontró autorización con `getSession()` en los fuentes de aplicación inspeccionados.
2. **Claves:** solo se encontró el cliente publishable/anon en browser/server. No aparece `service_role`; no se inspeccionaron variables actuales.
3. **Sesión en APIs:** los endpoints de persistencia citados exigen sesión mediante helper común. `/api/assistant` permite POST sin autenticar; revisar tasa/uso del proveedor si aplica.
4. **RLS:** las migraciones habilitan RLS en las tablas que crean. `trip_groups` y sus elementos tienen políticas propias. Falta evidencia remota actual y del estado de privilegios Data API, precisamente el objetivo de la nueva migración pendiente.
5. **Diagnóstico:** los errores de base se registran sin devolver el mensaje crudo al cliente; el cambio local específico registra código/recurso/hostname para PGRST205. No atribuir un fallo de producción a proyecto equivocado, grants o RLS sin revisar logs/configuración con evidencia.

## Plan propuesto para las siguientes fases

1. **Arquitectura y contratos:** fijar estructura objetivo de App Router, límites entre UI, dominio, persistencia y APIs; inventariar enlaces y formularios antes de mover archivos.
2. **Autenticación y sesión:** consolidar cliente browser/server y guards, conservar flujo de confirmación por email y modo visitante.
3. **Modelo y validación:** separar tipos/esquemas de formularios, itinerario, fechas y preferencias; evitar cambiar semántica histórica de viajes.
4. **Persistencia Supabase:** centralizar acceso, propiedad, errores y contratos RPC; mantener RLS y no incorporar claves privilegiadas al navegador.
5. **Experiencia/rutas:** reorganizar navegación en cinco áreas principales y mantener destinos secundarios enlazados; no romper rutas ni funciones existentes.
6. **Pruebas/documentación:** pruebas unitarias/componentes/API para contratos críticos, lint, TypeScript y build; actualizar documentación de configuración por nombres, nunca valores secretos.
7. **Entrega:** revisar diff completo y migraciones en seco; preparar instrucciones de despliegue. Commits, push, despliegue o cambios remotos requieren la autorización aplicable de la fase correspondiente.

Cada fase debe empezar solo tras aprobación, crear un commit propio según el flujo solicitado y comprobar que no incorpora cambios preexistentes ajenos. No se creó rama ni commit durante esta auditoría: los cambios pendientes actuales se deben conservar y revisar antes de decidir la estrategia de rama.

## Resultado de Fase 0

Documento generado sin modificar código ni SQL. No se ejecutaron tests/build porque esta fase es de auditoría y no cambió código. Estado posterior esperado: mismos cuatro cambios preexistentes más `docs/AUDIT.md` sin seguimiento. Esperando aprobación explícita para iniciar la Fase 1.
