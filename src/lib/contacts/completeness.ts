import type { Contact } from "@/types";

/** Clave i18n (Pipelines.form) de cada dato obligatorio del contacto. */
export type ContactRequiredField =
  | "nombreCompleto"
  | "identificacion"
  | "contactEmail";

/** Datos que debe tener un contacto para poder crear un negocio con él. */
export function getMissingContactFields(
  contact:
    | Pick<Contact, "nombre_completo" | "identificacion" | "email">
    | null
    | undefined,
): ContactRequiredField[] {
  const missing: ContactRequiredField[] = [];
  if (!contact?.nombre_completo?.trim()) missing.push("nombreCompleto");
  if (!contact?.identificacion?.trim()) missing.push("identificacion");
  if (!contact?.email?.trim()) missing.push("contactEmail");
  return missing;
}