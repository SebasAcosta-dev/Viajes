"use client";

import { createContext, useContext, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

type FieldControlContext = { id: string; describedBy?: string; error?: string };
const fieldControlContext = createContext<FieldControlContext | null>(null);

type FieldProps = {
  label: string;
  hint?: string;
  error?: string;
  id: string;
  children: ReactNode;
};

export function Field({ label, hint, error, id, children }: FieldProps) {
  const descriptionId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <fieldControlContext.Provider value={{ id, describedBy: [descriptionId, errorId].filter(Boolean).join(" ") || undefined, error }}>
      <div className="ui-field">
        <label className="ui-field__label" htmlFor={id}>{label}</label>
        {children}
        {hint && <p id={descriptionId} className="ui-field__hint">{hint}</p>}
        {error && <p id={errorId} className="ui-field__error" role="alert">{error}</p>}
      </div>
    </fieldControlContext.Provider>
  );
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const field = useContext(fieldControlContext);
  return <input {...props}
    id={props.id ?? field?.id}
    aria-describedby={props["aria-describedby"] ?? field?.describedBy}
    aria-invalid={props["aria-invalid"] ?? (field?.error ? true : undefined)}
    className={["ui-input", className].filter(Boolean).join(" ")} />;
}

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  const field = useContext(fieldControlContext);
  return <select {...props}
    id={props.id ?? field?.id}
    aria-describedby={props["aria-describedby"] ?? field?.describedBy}
    aria-invalid={props["aria-invalid"] ?? (field?.error ? true : undefined)}
    className={["ui-select", className].filter(Boolean).join(" ")} />;
}
