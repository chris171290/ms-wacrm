import type { AttachmentErrorCode, DealDocumentType } from "@/lib/deals/attachments";

export interface StagedAttachment {
  key: string;
  documentType: DealDocumentType;
  file: File;
}

export async function uploadAttachment(
  dealId: string,
  documentType: DealDocumentType,
  file: File,
): Promise<{ ok: true } | { ok: false; code: AttachmentErrorCode }> {
  const body = new FormData();
  body.append("documentType", documentType);
  body.append("file", file);
  try {
    const res = await fetch(`/api/deals/${dealId}/attachments`, { method: "POST", body });
    if (res.ok) return { ok: true };
    if (res.status === 429) return { ok: false, code: "rate_limited" };
    const json = await res.json().catch(() => ({}));
    return { ok: false, code: (json?.error as AttachmentErrorCode) ?? "upload_failed" };
  } catch {
    return { ok: false, code: "upload_failed" };
  }
}

/** Sube de a uno (respeta el rate limit y no satura la memoria). Devuelve los que fallaron. */
export async function uploadStagedAttachments(
  dealId: string,
  staged: StagedAttachment[],
): Promise<StagedAttachment[]> {
  const failed: StagedAttachment[] = [];
  for (const item of staged) {
    const result = await uploadAttachment(dealId, item.documentType, item.file);
    if (!result.ok) failed.push(item);
  }
  return failed;
}