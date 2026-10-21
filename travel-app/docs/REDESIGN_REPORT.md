# Informe del rediseño de Viajes

## Alcance implementado

La rama `feat/rediseno-front` parte de `refactor/arquitectura`. El lenguaje visual usa un fondo cálido, verde profundo para navegación y acciones, acentos dorados, superficies claras, foco visible y una pila tipográfica del sistema que no necesita descargar fuentes durante el build.

| Pantalla | Tratamiento visual aplicado | Funcionalidad conservada |
| --- | --- | --- |
| Inicio | Hero fotográfico ligado al destino seleccionado, panel del próximo viaje, tarjetas y jerarquía del formulario | Próximos viajes, presupuestos por moneda, favoritos, borradores, intereses, generación y enlaces |
| Crear viaje | Encabezado editorial compartido y panel del asistente manual | Formulario, validaciones, modo visitante, vista previa y guardado |
| Mis viajes | Controles agrupados, tarjetas de superficie y jerarquía para listas y filtros | Vistas de tarjetas/lista/calendario, búsqueda, orden, filtros y edición |
| Itinerario | Encabezado de resultado y superficies diferenciadas para resumen, días y presupuesto | Edición, reordenamiento, detalles y guardado |
| Calendario | Panel cálido y selector de vista segmentado | Vistas mensual, semanal y agenda, navegación de fechas y viajes |
| Mapa | Espacio de trabajo en dos columnas, filtros y lista de actividades destacada | Coordenadas guardadas, selección y atribución de OpenStreetMap |
| Presupuesto | Encabezado y tarjetas por moneda | Estimaciones, gastos registrados, moneda separada y edición |
| Cuenta | Encabezado y pestañas adaptables | Auth, modo demo, preferencias, favoritos e importación local |
| Destinos y asistente | Encabezados compartidos y controles coherentes con el shell | Catálogo, formulario IA, estados demo/error y acciones de planificación |

La navegación conserva cinco destinos principales y marca las rutas secundarias en la sección correspondiente. Los alias `/favoritos` y `/perfil` siguen redirigiendo a Cuenta.

## Sistema de diseño

- Tokens de color, tipografía, superficies y estados en `src/app/globals.css`.
- Documentación de uso, responsive y accesibilidad: `docs/DESIGN_SYSTEM.md`.
- Primitives en `src/components/ui`: `Button`, `Card`, `Badge`, `Field`, `Input`, `Select` y `PageHeading`.
- `/dev/ui` está protegido por `NODE_ENV`; ejecuta `notFound()` fuera de desarrollo.
- Las ayudas y errores de `Field` se asocian automáticamente con `Input` y `Select`; botones y navegación conservan foco visible.
- El CSS responde a móvil y escritorio y respeta `prefers-reduced-motion`.

## Archivos principales

- Shell y tokens: `src/app/globals.css`, `src/app/layout.tsx`, `src/app/(app)/layout.tsx`.
- Componentes: `src/components/ui/*` y `src/components/layout/site-navigation.tsx`.
- Páginas: Inicio, crear, viajes, itinerario, calendario, mapa, presupuesto, Cuenta, destinos y asistente.
- Pruebas: `src/components/layout/site-navigation.test.tsx`, `src/components/ui/primitives.test.tsx` y `src/app/dev/ui/page.test.tsx`.
- Documentación: `docs/DESIGN_SYSTEM.md`, `docs/REDESIGN_REPORT.md`.
- Corrección de dos caracteres `\\n` preexistentes que rompían el parseo: `src/features/itinerary/services/activities-api.ts`, `src/features/trips/services/groups-api.ts`.

## Verificación

- Lint: correcto.
- TypeScript: correcto.
- Suite: 209 pruebas en 43 archivos.
- `git diff --check`: correcto.
- Build de producción: correcto en una copia temporal bajo `%TEMP%`, sin `.env*`, `.next` ni `.git`; `NEXT_PUBLIC_DATA_MODE=demo`. Se ejecutó fuera del sandbox porque el sandbox bloqueó el proceso hijo de TypeScript.
- El servidor de esa build respondió `/` con HTTP 200 y `/dev/ui` con HTTP 404 en producción.
- El build dentro de iCloud Drive falla al intentar sustituir `.next/server/app/(app)/api`: `fsutil` identifica la reparse point de Microsoft Cloud Files y sus metadatos `com.apple.CloudDocs`. No hay procesos Node activos. No se borró ni alteró `.next`.
- Se inició la build aislada con Edge headless y se revisaron capturas de Inicio, Planificar, Itinerario, Mapa, Presupuesto, Mis viajes y Cuenta en escritorio o móvil. Las capturas están en `docs/rediseno/`. En esta revisión se ajustó el envoltorio de las pestañas de Cuenta en pantallas estrechas.
- La revisión visual se hizo en modo demo y con contenido local disponible; no valida la experiencia autenticada contra Supabase.
- No se leyeron variables ni se ejecutó SQL o migraciones.

## Pendientes de publicación

Las capturas documentan la comprobación visual de esta iteración. El build local de iCloud sigue limitado por la reparse point de `.next`; la build aislada terminó correctamente. Antes de publicar, repetir las comprobaciones finales sobre el estado actualizado del árbol de trabajo.
