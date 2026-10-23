import { notFound } from "next/navigation";
import { Badge, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Field, Input, Select } from "@/components/ui";
import { CURRENCY_OPTIONS } from "@/lib/currency-catalog";

export default function UiPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  return (
    <main className="mx-auto w-full max-w-screen-xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <div className="mb-8">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Viajes · laboratorio visual</p>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Sistema de diseño</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Previsualización local de los componentes compartidos, sus variantes y estados. Esta ruta solo se muestra en desarrollo.</p>
      </div>

      <div className="ui-showcase">
        <section className="ui-showcase__section" aria-labelledby="buttons-title">
          <h2 id="buttons-title">Botones y estados</h2>
          <Card><CardContent className="ui-showcase__row">
            <Button>Continuar</Button>
            <Button variant="secondary">Acción secundaria</Button>
            <Button variant="outline">Contorno</Button>
            <Button variant="ghost">Sutil</Button>
            <Button variant="danger">Eliminar</Button>
            <Button size="sm">Pequeño</Button>
            <Button size="lg">Grande</Button>
            <Button loading>Guardando</Button>
            <Button disabled>Deshabilitado</Button>
          </CardContent></Card>
        </section>

        <section className="ui-showcase__section" aria-labelledby="badges-title">
          <h2 id="badges-title">Etiquetas</h2>
          <Card><CardContent className="ui-showcase__row">
            <Badge>Próximo</Badge><Badge variant="brand">En planificación</Badge>
            <Badge variant="success">Confirmado</Badge><Badge variant="warning">Pendiente</Badge>
            <Badge variant="danger">Error</Badge>
          </CardContent></Card>
        </section>

        <div className="ui-showcase__grid">
          <section className="ui-showcase__section" aria-labelledby="fields-title">
            <h2 id="fields-title">Campos</h2>
            <Card><CardContent className="grid gap-4">
              <Field id="ui-destination" label="Destino" hint="Ciudad o país que quieres descubrir.">
                <Input id="ui-destination" placeholder="Lisboa, Portugal" />
              </Field>
              <Field id="ui-currency" label="Moneda">
                <Select id="ui-currency" defaultValue="EUR">{CURRENCY_OPTIONS.map(({ code, name }) => <option key={code} value={code}>{code} — {name}</option>)}</Select>
              </Field>
              <Field id="ui-error" label="Fecha de salida" error="Selecciona una fecha válida.">
                <Input id="ui-error" type="date" aria-invalid="true" aria-describedby="ui-error-error" />
              </Field>
            </CardContent></Card>
          </section>

          <section className="ui-showcase__section" aria-labelledby="cards-title">
            <h2 id="cards-title">Superficies y estados</h2>
            <Card>
              <CardHeader><CardTitle>Escapada a Lisboa</CardTitle><CardDescription>Del 12 al 16 de junio · 2 viajeros</CardDescription></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="ui-skeleton" aria-label="Vista de carga de una tarjeta" aria-busy="true"><span /><span /><span /></div>
                <div role="status" className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900">Los cambios se guardaron correctamente.</div>
                <div role="alert" className="rounded-2xl bg-red-50 p-4 text-sm text-red-900">No se pudo completar la operación. Inténtalo de nuevo.</div>
                <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">Aún no hay viajes para mostrar.</div>
              </CardContent>
              <CardFooter><span className="text-sm text-slate-600">Presupuesto estimado</span><strong>640 €</strong></CardFooter>
            </Card>
          </section>
        </div>
      </div>
    </main>
  );
}
