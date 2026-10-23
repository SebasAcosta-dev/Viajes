# Sistema visual de Viajes

El sistema visual presenta Viajes como un espacio calmado para descubrir destinos y organizar planes. Combina una base cálida y clara con verde profundo para navegación y acciones principales, y reserva el dorado para detalles de orientación.

## Fundamentos

### Color

| Token CSS | Valor | Uso |
| --- | --- | --- |
| `--background` | `#f3f4ef` | Fondo de aplicación |
| `--surface` | `#fffefa` | Superficies cálidas y formularios |
| `--surface-raised` | `#ffffff` | Tarjetas elevadas |
| `--foreground` | `#142b2b` | Texto principal |
| `--ink-muted` | `#60706c` | Texto de apoyo |
| `--brand-deep` | `#102f30` | Navegación |
| `--brand` | `#256b61` | Acentos y enlaces |
| `--brand-soft` | `#e4efea` | Estados de selección suaves |
| `--accent-gold` | `#dfb96b` | Marca, foco y detalles destacados |
| `--danger`, `--success`, `--warning` | tonos de estado | Errores, confirmaciones y avisos |

Mantén el contraste de texto suficiente frente a su superficie. Los colores de estado siempre se acompañan de texto; el color no transmite por sí solo un resultado.

### Tipografía

La interfaz utiliza la pila sans del sistema para evitar descargas de fuentes en tiempo de build y aprovechar la tipografía nativa del dispositivo. La marca usa Georgia para aportar un acento editorial. Usa títulos concisos, jerarquías claras y texto de apoyo con interlineado generoso.

### Forma y espacio

- Tarjetas: radio entre `1rem` y `1.4rem`, borde sutil y sombra baja.
- Acciones principales y etiquetas: radio de píldora.
- Campos: controles de al menos `2.75rem` de alto y radio de `.85rem`.
- Contenido: ancho máximo compartido de `1500px`; reduce el padding lateral en móvil.
- No fuerces anchos mínimos que provoquen desplazamiento horizontal.

## Componentes compartidos

Importa los componentes desde `@/components/ui`.

### Button

`Button` ofrece `primary`, `secondary`, `outline`, `ghost` y `danger`; tamaños `sm`, `md` y `lg`; y estados `loading` y `disabled`. El estado de carga bloquea la acción y comunica `aria-busy`.

### Card

Compón superficies con `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent` y `CardFooter`. Conserva los encabezados semánticos según su posición real en la página.

### Badge

Usa `neutral`, `brand`, `success`, `warning` o `danger` con una etiqueta textual breve.

### Field, Input y Select

`Field` asocia etiqueta, ayuda y error al identificador del control. `Input` y `Select` exponen los atributos nativos de HTML. Añade `aria-invalid` al control cuando tenga error.

`PageHeading` mantiene una jerarquía común de eyebrow, título, descripción opcional y acciones.

## Estados de interfaz

- **Carga:** informa con `role="status"` o `aria-busy`; no muestres datos inventados como si estuvieran guardados.
- **Vacío:** explica qué falta y ofrece una acción útil si existe una.
- **Error:** usa `role="alert"`, lenguaje concreto y conserva la causa útil para el usuario.
- **Éxito:** confirma la acción con `role="status"`.
- **Deshabilitado:** mantén la explicación disponible y conserva una diferencia visual reconocible.

## Responsive y accesibilidad

- La navegación de escritorio permanece en una fila; a menos de `900px` usa el menú de dos columnas.
- Las rejillas pasan a una columna en móvil y a dos o más solo cuando hay espacio.
- Mantén foco visible en enlaces, botones y campos; no elimines el outline sin reemplazo.
- Respeta `prefers-reduced-motion`.
- Usa texto visible en botones de acción; los iconos decorativos llevan `aria-hidden`.
- Las etiquetas de campos y los errores deben estar asociados mediante `label`, `aria-describedby` y `aria-invalid`.

## Previsualización

`/dev/ui` muestra las variantes y estados de los componentes. El Route Handler devuelve 404 fuera de `NODE_ENV=development`; no se publica como galería de producción.
