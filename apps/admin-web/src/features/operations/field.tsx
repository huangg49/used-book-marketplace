import type { ReactNode } from "react";

// A labelled control with its hint, or its error in place of the hint.
export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <>
      <div className="field">
        <label htmlFor={id}>{label}</label>
        {children}
      </div>
      <p id={`${id}-hint`} className={error ? "field-error" : "muted"}>
        {error ?? hint}
      </p>
    </>
  );
}
