import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/ai/admin-client";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { assertCanModifyDealAttachments } from "@/lib/deals/attachment-access";

export const runtime = "nodejs";

const BUCKET = "deal-documents";
const SIGNED_URL_TTL_SECONDS = 60;

type Params = { params: Promise<{ id: string; attachmentId: string }> };

/** Devuelve una URL firmada de corta duración para ver el documento. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const ctx = await requireRole("agent");
    const { id: dealId, attachmentId } = await params;

    const limit = checkRateLimit(`deals:attachmentView:${ctx.userId}`, {
      limit: 60,
      windowMs: 60_000,
    });
    if (!limit.success) return rateLimitResponse(limit);

    // La RLS de deal_attachments decide si el usuario puede ver este registro.
    const { data: row } = await ctx.supabase
      .from("deal_attachments")
      .select("storage_path")
      .eq("id", attachmentId)
      .eq("deal_id", dealId)
      .maybeSingle();
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const { data, error } = await supabaseAdmin()
      .storage.from(BUCKET)
      .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS);
    if (error || !data) {
      console.error("[deals/attachments] sign failed:", error?.message);
      return NextResponse.json({ error: "upload_failed" }, { status: 502 });
    }

    return NextResponse.json(
      { url: data.signedUrl },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const ctx = await requireRole("agent");
    const { id: dealId, attachmentId } = await params;

    const access = await assertCanModifyDealAttachments(ctx, dealId);
    if (!access.ok) {
      return NextResponse.json({ error: access.code }, { status: access.status });
    }

    const { data: row } = await ctx.supabase
      .from("deal_attachments")
      .select("id, storage_path")
      .eq("id", attachmentId)
      .eq("deal_id", dealId)
      .maybeSingle();
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const admin = supabaseAdmin();

    // Primero el archivo: si falla, la fila sigue y se puede reintentar.
    const { error: removeError } = await admin.storage
      .from(BUCKET)
      .remove([row.storage_path]);
    if (removeError) {
      console.error("[deals/attachments] remove failed:", removeError.message);
      return NextResponse.json({ error: "upload_failed" }, { status: 502 });
    }

    const { error: deleteError } = await admin
      .from("deal_attachments")
      .delete()
      .eq("id", row.id);
    if (deleteError) {
      console.error("[deals/attachments] row delete failed:", deleteError.message);
      return NextResponse.json({ error: "upload_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}