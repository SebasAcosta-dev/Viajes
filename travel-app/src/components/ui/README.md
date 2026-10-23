# Componentes compartidos

Los componentes visuales agnósticos del dominio viven aquí y se exportan desde `index.ts`. Usa los tokens y patrones de [`docs/DESIGN_SYSTEM.md`](../../../docs/DESIGN_SYSTEM.md).

- `Button`: acciones de formulario con variantes y carga.
- `Card`: superficie compuesta con encabezado, contenido y pie.
- `Badge`: etiqueta textual de estado.
- `Field`, `Input` y `Select`: controles accesibles con ayuda y error asociados.
- `PageHeading`: encabezados coherentes para páginas y sus acciones.

Los componentes de dominio pertenecen a `src/features/*/components`. Mantén la lógica de viajes fuera de estos primitives. El catálogo de variantes está en `/dev/ui` y se devuelve como 404 en producción.
