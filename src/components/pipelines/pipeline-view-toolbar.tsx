"use client";

import { Download, Kanban, Table2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export type PipelineView = "kanban" | "table";

interface PipelineViewToolbarProps {
  view: PipelineView;
  onViewChange: (view: PipelineView) => void;
  onExport: () => void;
  exportDisabled: boolean;
  /** Negocios que se ven con los filtros actuales. */
  totalCount: number;
}

export function PipelineViewToolbar({
  view,
  onViewChange,
  onExport,
  exportDisabled,
  totalCount,
}: PipelineViewToolbarProps) {
  const t = useTranslations("Pipelines.page");

  const options = [
    { id: "kanban", icon: Kanban, label: t("viewKanban") },
    { id: "table", icon: Table2, label: t("viewTable") },
  ] as const;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        role="group"
        aria-label={t("viewSwitcher")}
        className="inline-flex rounded-lg border border-border bg-card p-0.5"
      >
        {options.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            type="button"
            aria-pressed={view === id}
            title={label}
            onClick={() => onViewChange(id)}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
              view === id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={exportDisabled}
        onClick={onExport}
        className="border-border bg-card text-foreground hover:bg-muted"
      >
        <Download className="mr-1.5 h-4 w-4" />
        {t("exportCsv")}
      </Button>

      <span className="ml-auto text-xs text-muted-foreground">
        {t("resultsCount", { count: totalCount })}
      </span>
    </div>
  );
}
