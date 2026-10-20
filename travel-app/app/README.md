# Viajes

Aplicación web de planificación de viajes construida con Next.js, React y Tailwind.

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

La migración crea perfiles vinculados a `auth.users`, el catálogo público de destinos/lugares, viajes, días, actividades, favoritos y gastos. Las tablas privadas activan RLS y las políticas vinculan cada fila al usuario autenticado. Las rutas API vuelven a comprobar la sesión antes de usar el cliente Supabase con cookies; RLS sigue siendo la frontera final de autorización. No se puede afirmar que una operación está persistida en Supabase hasta que el servidor devuelve éxito. Sin credenciales, mantén el modo demo y prueba la persistencia local.

La migración versionada indicada arriba es el esquema autoritativo. No ejecutes otro esquema SQL parcial en paralelo.

## Ejecutar

```bash
npm install
npm run dev
```

La ruta `POST /api/assistant` valida el mensaje y contexto antes de enviar datos a OpenRouter. No realiza reservas, compras ni cambios persistentes.

Para MiniMax M3.1 Flash, el cliente usa los parámetros anunciados por OpenRouter para este modelo: `max_tokens` con un límite ampliado y `reasoning: { effort: "low", exclude: true }`. El razonamiento consume parte del límite total. Las respuestas con `finish_reason=length` reciben hasta dos continuaciones controladas; el servidor evita solapamientos y avisa si el resultado aún puede estar incompleto. Las solicitudes de itinerario piden JSON compacto (hasta tres actividades por día) y se convierten desde JSON (también admite bloques Markdown y aliases explícitos) al esquema de dominio validado en servidor. El servidor comprueba días, presupuesto, moneda, fechas y actividades, permite costes desconocidos sin inventarlos y puede pedir hasta dos correcciones desde el prompt base, sin reutilizar una salida truncada extensa. Los itinerarios válidos se muestran como tarjetas por jornada; las respuestas generales se representan como Markdown seguro.
