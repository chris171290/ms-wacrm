import type { AccountContext } from "@/lib/auth/account";
import { hasMinRole } from "@/lib/auth/roles";
import { getAgentEditableStageIds } from "@/lib/pipelines/agent-stages";
import type { PipelineStage } from "@/types";

export type DealAttachmentAccess =
  | { ok: true }
  | { ok: false; status: 403 | 404; code: "not_editable" | "not_found" };

/**
 * ¿Puede el usuario modificar los documentos de este deal? Misma regla que
 * editar el deal: lo ve por RLS, no está integrado (salvo admin+) y, si es
 * agente, está en una de las dos primeras etapas.
 */
export async function assertCanModifyDealAttachments(
  ctx: AccountContext,
  dealId: string,
): Promise<DealAttachmentAccess> {
  const { data: deal } = await ctx.supabase
    .from("deals")
    .select("id, stage_id, pipeline_id, esta_integrado")
    .eq("id", dealId)
    .maybeSingle();

  // RLS: un deal que el usuario no puede ver se comporta como inexistente.
  if (!deal) return { ok: false, status: 404, code: "not_found" };

  if (deal.esta_integrado && !hasMinRole(ctx.role, "admin")) {
    return { ok: false, status: 403, code: "not_editable" };
  }

  if (ctx.role === "agent") {
    const { data: stages } = await ctx.supabase
      .from("pipeline_stages")
      .select("id, position")
      .eq("pipeline_id", deal.pipeline_id);
    const editable = getAgentEditableStageIds((stages ?? []) as PipelineStage[]);
    if (!editable.has(deal.stage_id)) {
      return { ok: false, status: 403, code: "not_editable" };
    }
  }

  return { ok: true };
}