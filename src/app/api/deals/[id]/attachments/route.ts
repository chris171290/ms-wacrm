import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/ai/admin-client";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { assertCanModifyDealAttachments } from "@/lib/deals/attachment-access";
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_PER_TYPE,
  buildAttachmentPath,
  checkAttachment,
  displayFileName,
  isDealDocumentType,
  type AttachmentErrorCode,
} from "@/lib/deals/attachments";

export const runtime = "nodejs";

const BUCKET = "deal-documents";

function fail(code: AttachmentErrorCode, status: number) {
  return NextResponse.json({ error: code }, { status });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("agent");
    const { id: dealId } = await params;

    const limit = checkRateLimit(`deals:attachmentUpload:${ctx.userId}`, {
      limit: 20,
      windowMs: 60_000,
    });
    if (!limit.success) return rateLimitResponse(limit);

    // Corta antes de leer el cuerpo si ya declara más de lo permitido.
    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > ATTACHMENT_MAX_BYTES + 64 * 1024) return fail("too_large", 413);

    const access = await assertCanModifyDealAttachments(ctx, dealId);
    if (!access.ok) return fail(access.code, access.status);

    const form = await request.formData().catch(() => null);
    const documentType = form?.get("documentType");
    const file = form?.get("file");
    if (!isDealDocumentType(documentType)) return fail("invalid_document_type", 400);
    if (!(file instanceof File)) return fail("missing_file", 400);
    if (file.size > ATTACHMENT_MAX_BYTES) return fail("too_large", 413);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const check = checkAttachment(bytes.byteLength, bytes.subarray(0, 16));
    if (!check.ok) return fail(check.code, check.code === "too_large" ? 413 : 400);

    const { count } = await ctx.supabase
      .from("deal_attachments")
      .select("id", { count: "exact", head: true })
      .eq("deal_id", dealId)
      .eq("document_type", documentType);
    if ((count ?? 0) >= ATTACHMENT_MAX_PER_TYPE) return fail("limit_reached", 409);

    const admin = supabaseAdmin();
    const path = buildAttachmentPath(ctx.accountId, dealId, check.ext);

    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: check.mime, upsert: false });
    if (uploadError) {
      console.error("[deals/attachments] storage upload failed:", uploadError.message);
      return fail("upload_failed", 502);
    }

    const { data: row, error: insertError } = await admin
      .from("deal_attachments")
      .insert({
        account_id: ctx.accountId,
        deal_id: dealId,
        document_type: documentType,
        storage_path: path,
        file_name: displayFileName(file.name, check.ext),
        mime_type: check.mime,
        size_bytes: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        uploaded_by: ctx.userId,
      })
      .select("id, document_type, file_name, mime_type, size_bytes, created_at")
      .single();

    if (insertError) {
      // Compensación: no dejar un archivo huérfano sin fila que lo referencie.
      await admin.storage.from(BUCKET).remove([path]);
      if (insertError.code === "23505") return fail("duplicate", 409);
      console.error("[deals/attachments] insert failed:", insertError.message);
      return fail("upload_failed", 500);
    }

    return NextResponse.json({ attachment: row }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}