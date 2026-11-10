import { sanitizeFilename } from "@/lib/media/filename";

export const DEAL_DOCUMENT_TYPES = ["cedula", "comprobante_transferencia"] as const;
export type DealDocumentType = (typeof DEAL_DOCUMENT_TYPES)[number];

export const ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;
export const ATTACHMENT_MAX_PER_TYPE = 5;
export const ATTACHMENT_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

const EXT_BY_MIME = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
} as const;
export type AttachmentMime = keyof typeof EXT_BY_MIME;

export type AttachmentErrorCode =
  | "invalid_document_type"
  | "missing_file"
  | "empty_file"
  | "too_large"
  | "invalid_type"
  | "limit_reached"
  | "duplicate"
  | "not_editable"
  | "not_found"
  | "rate_limited"
  | "upload_failed";

export function isDealDocumentType(value: unknown): value is DealDocumentType {
  return (DEAL_DOCUMENT_TYPES as readonly unknown[]).includes(value);
}

/** Tipo real del archivo según sus primeros bytes (magic numbers). */
export function detectMimeFromBytes(head: Uint8Array): AttachmentMime | null {
  const at = (sig: number[], offset = 0) =>
    sig.every((byte, i) => head[offset + i] === byte);

  if (at([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (at([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (at([0x52, 0x49, 0x46, 0x46]) && at([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  if (at([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  return null;
}

export type FileCheck =
  | { ok: true; mime: AttachmentMime; ext: string }
  | { ok: false; code: AttachmentErrorCode };

/** Valida tamaño y contenido real. `head` = primeros 16 bytes del archivo. */
export function checkAttachment(size: number, head: Uint8Array): FileCheck {
  if (size <= 0) return { ok: false, code: "empty_file" };
  if (size > ATTACHMENT_MAX_BYTES) return { ok: false, code: "too_large" };
  const mime = detectMimeFromBytes(head);
  if (!mime) return { ok: false, code: "invalid_type" };
  return { ok: true, mime, ext: EXT_BY_MIME[mime] };
}

/** Misma validación en el navegador, antes de subir nada. */
export async function preflightFile(file: File): Promise<FileCheck> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  return checkAttachment(file.size, head);
}

/**
 * Ruta en Storage: sin nada controlado por el usuario (solo UUIDs), por lo que
 * no hay path traversal ni colisiones. Primer segmento = `account-<id>`, igual
 * que los demás buckets del proyecto.
 */
export function buildAttachmentPath(accountId: string, dealId: string, ext: string): string {
  return `account-${accountId}/deal-${dealId}/${crypto.randomUUID()}.${ext}`;
}

/** Nombre para mostrar: saneado y con la extensión del tipo REAL detectado. */
export function displayFileName(original: string, ext: string): string {
  const clean = sanitizeFilename(original).replace(/\.[^.]+$/, "") || "documento";
  return `${clean.slice(0, 60)}.${ext}`;
}