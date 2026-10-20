# Viajes

Aplicación web de planificación de viajes construida con Next.js, React y Tailwind.

La navegación principal se concentra en **Inicio**, **Mis viajes**, **Mapa**, **Presupuesto** y **Cuenta**. El calendario está integrado en la vista de Mis viajes; su ruta anterior `/calendario` permanece disponible. El asistente, la planificación, los destinos, los favoritos y las preferencias siguen accesibles desde Inicio, el flujo de viajes o Cuenta.

## Modo de demostración e integración de IA

La aplicación funciona sin conexión a Supabase ni a proveedores de IA. `NEXT_PUBLIC_APP_MODE=demo` (también el valor predeterminado si no se configura) ejecuta el asistente local determinista y no llama a servicios externos.

## Variables de entorno

Copia `.env.example` a `.env.local`. Para activar MiniMax mediante OpenRouter, configura las siguientes variables en el servidor:

- `AI_API_KEY`: clave secreta de OpenRouter. No uses el prefijo `NEXT_PUBLIC_`.
- `AI_PROVIDER=openrouter`
- `AI_MODEL=minimax/minimax-m3.1-flash:free`
- `NEXT_PUBLIC_APP_MODE=production`
- `NEXT_PUBLIC_SITE_URL`: URL pública de la aplicación, opcional para desarrollo local.

La clave se lee únicamente en `app/lib/ai.ts`, en el servidor. Reinicia Next.js después de cambiar `.env.local`. El modo `production` requiere una clave válida; los errores de autenticación, crédito/límite, modelo no disponible y proveedor no disponible se muestran como errores, no como respuestas demo.

El modelo debe estar disponible para tu cuenta en OpenRouter. La variante `:free` está sujeta a límites de uso y disponibilidad de OpenRouter; si necesitas una variante de pago, usa el identificador exacto que aparezca en el catálogo de OpenRouter.

## Persistencia Supabase

La persistencia tiene su propio selector, independiente del modo de IA:

- `NEXT_PUBLIC_DATA_MODE=demo` (predeterminado): viajes, gastos y favoritos se guardan en `localStorage` de este navegador. No se sincronizan entre dispositivos ni usuarios.
- `NEXT_PUBLIC_DATA_MODE=supabase`: requiere una cuenta Supabase, autenticación por correo/contraseña y las variables públicas `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Solo se usa la clave publishable/anon, nunca `service_role`.

Para activar Supabase:

1. Crea un proyecto en Supabase y habilita **Authentication → Providers → Email**. Configura la confirmación de correo y sus URLs de redirección para los entornos que uses.
2. Copia la URL del proyecto y su clave **Publishable** desde Project Settings → API Keys a `.env.local`. Conserva las variables `AI_*` existentes para MiniMax; no sustituyas `AI_API_KEY`.
3. Cambia `NEXT_PUBLIC_DATA_MODE=demo` por `NEXT_PUBLIC_DATA_MODE=supabase` y reinicia Next.js.
4. Aplica `supabase/migrations/20261019000100_initial_schema.sql` al proyecto, por ejemplo, desde el SQL Editor de Supabase. Alternativamente, configura Supabase CLI, enlaza el proyecto y ejecuta `supabase db push`.
5. Abre `/cuenta`, registra o inicia sesión y confirma el correo si el proyecto lo requiere.
6. Guarda un itinerario en `/ia`. Después puedes verlo y editar sus actividades/presupuesto, eliminarlo con confirmación o registrar gastos en `/viajes` y `/presupuesto`; los favoritos están en `/favoritos`.

Aplica las migraciones versionadas en orden:

1. `supabase/migrations/20261019000100_initial_schema.sql`
2. `supabase/migrations/20261020000200_itinerary_activity_metadata.sql`
3. `supabase/migrations/20261020000300_itinerary_schedule.sql`
4. `supabase/migrations/20261020000400_trip_management.sql`

La última migración añade notas y vínculos de gastos con actividades, viajes combinados y funciones seguras para actualizar fechas, reordenar actividades y regenerar una sola jornada. No la ejecutes contra una base de datos productiva sin revisar el estado de las migraciones; las migraciones no se aplican automáticamente desde la aplicación.

El esquema incluye perfiles vinculados a `auth.users`, el catálogo público de destinos/lugares, viajes, días, actividades, favoritos y gastos. Las tablas privadas activan RLS y las políticas vinculan cada fila al usuario autenticado. Las rutas API vuelven a comprobar la sesión antes de usar el cliente Supabase con cookies; RLS sigue siendo la frontera final de autorización. No se puede afirmar que una operación está persistida en Supabase hasta que el servidor devuelve éxito. Sin credenciales, mantén el modo demo y prueba la persistencia local.

La migración versionada indicada arriba es el esquema autoritativo. No ejecutes otro esquema SQL parcial en paralelo.

## Ejecutar

```bash
npm install
npm run dev
```

La ruta `POST /api/assistant` valida el mensaje y contexto antes de enviar datos a OpenRouter. No realiza reservas, compras ni cambios persistentes. En `/viajes` puedes filtrar, ordenar, duplicar, editar y completar viajes, administrar gastos, consultar el calendario por mes/semana/agenda y regenerar una jornada confirmando el reemplazo. `/calendario` permanece disponible como acceso secundario al mismo calendario. `/mapa` usa las coordenadas existentes en las actividades y teselas OpenStreetMap; no geocodifica ni inventa rutas cuando faltan coordenadas. Los viajes combinados agrupan referencias a viajes guardados y no fusionan ni eliminan los originales.

Para MiniMax M3.1 Flash, el cliente usa los parámetros anunciados por OpenRouter para este modelo: `max_tokens` con un límite ampliado y `reasoning: { effort: "low", exclude: true }`. El razonamiento consume parte del límite total. Las respuestas con `finish_reason=length` reciben hasta dos continuaciones controladas; el servidor evita solapamientos y avisa si el resultado aún puede estar incompleto. Las solicitudes de itinerario piden JSON compacto y se convierten al esquema de dominio validado en servidor. El servidor comprueba días, presupuesto, moneda, fechas y actividades, permite costes desconocidos sin inventarlos y puede pedir hasta dos correcciones desde el prompt base, sin reutilizar una salida truncada extensa. Los itinerarios se presentan como líneas temporales diarias. Las respuestas generales se representan como Markdown seguro.

## Despliegue en Vercel

1. Importa el repositorio y configura `travel-app` como **Root Directory**.
2. Añade en Project Settings → Environment Variables las variables requeridas para el modo elegido. Para Supabase, configura `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `NEXT_PUBLIC_DATA_MODE=supabase`. Para el asistente de OpenRouter, configura `AI_API_KEY`, `AI_PROVIDER=openrouter`, `AI_MODEL` y `NEXT_PUBLIC_APP_MODE=production`. `AI_API_KEY` debe permanecer como variable solo de servidor, nunca con prefijo `NEXT_PUBLIC_`.
3. Establece `NEXT_PUBLIC_SITE_URL` con el dominio de producción y añade los dominios de producción/preview apropiados a los ajustes de URL de autenticación de Supabase.
4. Aplica manualmente y en orden las migraciones indicadas en la sección anterior a la base de datos vinculada. No se ejecutan durante el build ni el despliegue.
5. Despliega y verifica el inicio de sesión, el modo de persistencia seleccionado, la lectura/escritura de viajes y el asistente. El mapa requiere acceso del navegador a las teselas de OpenStreetMap y solo podrá mostrar actividades con coordenadas guardadas.

Para validar localmente:

```bash
npm.cmd run test -- --run
npm.cmd run lint
npm.cmd run build
```
