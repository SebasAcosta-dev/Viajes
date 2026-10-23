"use client";

import { useMemo, useState } from "react";
import { interestCategories } from "@/lib/interest-catalog";

export function InterestPicker({
  selected,
  customInterests,
  onSelectedChange,
  onCustomInterestsChange,
}: {
  selected: string[];
  customInterests: string[];
  onSelectedChange: (interests: string[]) => void;
  onCustomInterestsChange: (interests: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [customInput, setCustomInput] = useState("");
  const filteredCategories = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es");
    return interestCategories
      .map((category) => ({
        ...category,
        options: category.options.filter((interest) => !query || interest.toLocaleLowerCase("es").includes(query)),
      }))
      .filter((category) => category.options.length > 0);
  }, [search]);

  const toggle = (interest: string) => {
    onSelectedChange(selected.includes(interest)
      ? selected.filter((entry) => entry !== interest)
      : [...selected, interest]);
  };

  const addCustom = () => {
    const interest = customInput.trim();
    if (!interest || interest.length > 80 || customInterests.some((entry) => entry.toLocaleLowerCase("es") === interest.toLocaleLowerCase("es"))) return;
    onCustomInterestsChange([...customInterests, interest]);
    setCustomInput("");
  };

  return (
    <section className="space-y-3" aria-label="Intereses del viaje">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="min-w-48 flex-1 text-sm font-medium text-slate-700">
          Buscar intereses
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            type="search"
            placeholder="Ej.: fútbol, arquitectura, mercados"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5"
          />
        </label>
        <button
          type="button"
          onClick={() => { onSelectedChange([]); onCustomInterestsChange([]); }}
          className="min-h-11 rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
        >
          Limpiar selecciones
        </button>
      </div>
      {selected.length + customInterests.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Intereses seleccionados">
          {[...selected, ...customInterests].map((interest) => (
            <button
              key={interest}
              type="button"
              onClick={() => selected.includes(interest)
                ? toggle(interest)
                : onCustomInterestsChange(customInterests.filter((entry) => entry !== interest))}
              className="min-h-11 rounded-full bg-emerald-100 px-4 py-2 text-sm font-medium text-emerald-900"
              aria-label={`Quitar ${interest}`}
            >
              {interest} ×
            </button>
          ))}
        </div>
      )}
      <div className="grid min-w-0 grid-cols-1 gap-2 md:grid-cols-2">
        {filteredCategories.map((category) => (
          <details key={category.name} open={Boolean(search) || category.name === "Cultura e historia"} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <summary className="cursor-pointer break-words font-semibold text-slate-800">{category.name}</summary>
            <div className="mt-3 flex min-w-0 flex-wrap gap-2">
              {category.options.map((interest) => {
                const checked = selected.includes(interest);
                return (
                  <label
                    key={interest}
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition ${
                      checked ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(interest)}
                      className="sr-only"
                    />
                    <span>{interest}</span>
                  </label>
                );
              })}
            </div>
          </details>
        ))}
        {filteredCategories.length === 0 && <p className="p-2 text-sm text-slate-600">No se encontraron intereses.</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="min-w-48 flex-1 text-sm font-medium text-slate-700">
          Añadir otro interés
          <input
            value={customInput}
            onChange={(event) => setCustomInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addCustom();
              }
            }}
            maxLength={80}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
            placeholder="Escribe un interés personalizado"
          />
        </label>
        <button type="button" onClick={addCustom}         className="min-h-11 self-end rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white">
          Añadir
        </button>
      </div>
    </section>
  );
}
