"use client";

import { useId } from "react";
import { columnLabels } from "./detect";
import { REQUIRED_ROLES, ROLE_LABELS, ROLES, type Mapping, type Role } from "./types";
import { Field, selectClass } from "./ui";

export function MappingBar({
  headers,
  mapping,
  onChange,
}: {
  headers: readonly string[];
  mapping: Mapping;
  onChange: (role: Role, column: number | undefined) => void;
}) {
  const hintId = useId();
  const labels = columnLabels(headers);

  return (
    <fieldset className="no-print rounded-2xl border border-line bg-surface p-4" aria-describedby={hintId}>
      <legend className="px-1 text-sm font-semibold">Columns</legend>
      <p id={hintId} className="text-sm text-muted">
        Matched automatically. Date and Amount are required; change any choice and the dashboard updates.
      </p>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {ROLES.map((role) => {
          const required = REQUIRED_ROLES.includes(role);
          const value = mapping[role];
          const missing = required && value === undefined;
          return (
            <Field key={role} label={ROLE_LABELS[role]}>
              {(id) => (
                <select
                  id={id}
                  className={`${selectClass} ${missing ? "border-danger" : ""}`}
                  value={value === undefined ? "" : String(value)}
                  required={required}
                  aria-invalid={missing || undefined}
                  onChange={(event) =>
                    onChange(role, event.target.value === "" ? undefined : Number(event.target.value))
                  }
                >
                  {required ? (
                    <option value="" disabled>
                      Choose a column
                    </option>
                  ) : (
                    <option value="">Not used</option>
                  )}
                  {labels.map((label, index) => (
                    <option key={index} value={index}>
                      {label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          );
        })}
      </div>
    </fieldset>
  );
}
