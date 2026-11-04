import type { PipelineStage } from "@/types";

/** Un agente solo puede editar deals en las N primeras etapas (por `position`). */
export const AGENT_EDITABLE_STAGE_COUNT = 2;

export function getAgentEditableStageIds(stages: PipelineStage[]): Set<string> {
  return new Set(
    [...stages]
      .sort((a, b) => a.position - b.position)
      .slice(0, AGENT_EDITABLE_STAGE_COUNT)
      .map((s) => s.id),
  );
}