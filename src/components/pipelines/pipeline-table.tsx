"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import type { Deal, PipelineStage } from "@/types";
import { formatCurrency } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PAGE_SIZE = 25;

type SortDir = "asc" | "desc";

interface Column {
  id: string;
  /** Visibilidad responsiva (p. ej. "hidden lg:table-cell"). */
  className?: string;
  /** Si no tiene, la columna no es ordenable. null = siempre al final. */
  sortValue?: (deal: Deal) => string | number | null;
  cell: (deal: Deal) => ReactNode;
}

interface PipelineTableProps {
  stages: PipelineStage[];
  deals: Deal[];
  onEditDeal: (deal: Deal) => void;
}

/**
 * Las columnas DATE de Postgres llegan como "YYYY-MM-DD". `new Date()` las
 * interpreta como medianoche UTC y en Ecuador (UTC-5) mostraría el día
 * anterior, así que se parsean como fecha local.
 */
function formatDate(value: string | null | undefined, locale: string) {
  if (!value) return "—";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);
  return date.toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function clientName(deal: Deal) {
  return (
    deal.contact?.nombre_completo?.trim() ||
    deal.contact?.name ||
    deal.title ||
    "—"
  );
}

export function PipelineTable({ stages, deals, onEditDeal }: PipelineTableProps) {
  const t = useTranslations("Pipelines.table");
  const locale = useLocale();
  const [sort, setSort] = useState<{ id: string; dir: SortDir }>({
    id: "createdAt",
    dir: "desc",
  });
  const [page, setPage] = useState(0);

  const stageById = useMemo(
    () => new Map(stages.map((s) => [s.id, s])),
    [stages],
  );

  const columns = useMemo<Column[]>(
    () => [
      {
        id: "client",
        sortValue: (d) => clientName(d),
        cell: (d) => (
          <span
            className="block max-w-[220px] truncate font-medium text-foreground"
            title={clientName(d)}
          >
            {clientName(d)}
          </span>
        ),
      },
      {
        id: "identification",
        className: "hidden md:table-cell",
        sortValue: (d) => d.contact?.identificacion ?? null,
        cell: (d) => d.contact?.identificacion || "—",
      },
      {
        id: "product",
        className: "hidden lg:table-cell",
        sortValue: (d) => d.producto_nombre ?? null,
        cell: (d) => (
          <span className="block max-w-[200px] truncate" title={d.producto_nombre}>
            {d.producto_nombre || "—"}
          </span>
        ),
      },
      {
        id: "value",
        sortValue: (d) => d.value,
        cell: (d) => (
          <span className="font-semibold text-primary">
            {formatCurrency(d.value, d.currency)}
          </span>
        ),
      },
      {
        id: "stage",
        sortValue: (d) => stageById.get(d.stage_id)?.position ?? null,
        cell: (d) => {
          const stage = stageById.get(d.stage_id);
          return (
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: stage?.color ?? "#94a3b8" }}
              />
              {stage?.name ?? "—"}
            </span>
          );
        },
      },
      {
        id: "status",
        sortValue: (d) => d.status ?? "open",
        cell: (d) => {
          const status = d.status ?? "open";
          if (status === "won") {
            return (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                <Check className="h-3 w-3" />
                {t("status.won")}
              </span>
            );
          }
          if (status === "lost") {
            return (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-400">
                <X className="h-3 w-3" />
                {t("status.lost")}
              </span>
            );
          }
          return (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {t("status.open")}
            </span>
          );
        },
      },
      {
        id: "assignee",
        className: "hidden md:table-cell",
        sortValue: (d) => d.assignee?.full_name ?? null,
        cell: (d) => d.assignee?.full_name || "—",
      },
      {
        id: "saleType",
        className: "hidden xl:table-cell",
        sortValue: (d) => d.tipo_de_venta ?? null,
        cell: (d) => d.tipo_de_venta || "—",
      },
      {
        id: "carrier",
        className: "hidden xl:table-cell",
        sortValue: (d) => d.operadora ?? null,
        cell: (d) => d.operadora || "—",
      },
      {
        id: "salesOrder",
        className: "hidden xl:table-cell",
        sortValue: (d) => d.orden_de_venta ?? null,
        cell: (d) => d.orden_de_venta || "—",
      },
      {
        id: "activationDate",
        className: "hidden lg:table-cell",
        sortValue: (d) => d.fecha_alta ?? null, // "YYYY-MM-DD" ordena bien como texto
        cell: (d) => formatDate(d.fecha_alta, locale),
      },
      {
        id: "createdAt",
        className: "hidden lg:table-cell",
        sortValue: (d) => d.created_at,
        cell: (d) => formatDate(d.created_at, locale),
      },
    ],
    [stageById, locale, t],
  );

  const sorted = useMemo(() => {
    const column = columns.find((c) => c.id === sort.id);
    if (!column?.sortValue) return deals;
    const getValue = column.sortValue;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...deals].sort((a, b) => {
      const va = getValue(a);
      const vb = getValue(b);
      if (va === vb) return 0;
      if (va == null) return 1; // vacíos siempre al final
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return (
        String(va).localeCompare(String(vb), undefined, {
          sensitivity: "base",
          numeric: true,
        }) * dir
      );
    });
  }, [deals, columns, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  // Si los filtros reducen los resultados, evita quedar en una página inexistente.
  const currentPage = Math.min(page, totalPages - 1);
  const start = currentPage * PAGE_SIZE;
  const rows = sorted.slice(start, start + PAGE_SIZE);

  function toggleSort(id: string) {
    setSort((prev) =>
      prev.id === id
        ? { id, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { id, dir: "asc" },
    );
    setPage(0);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            {columns.map((col) => {
              const label = t(`columns.${col.id}` as string);
              const isSorted = sort.id === col.id;
              return (
                <TableHead
                  key={col.id}
                  aria-sort={
                    col.sortValue
                      ? isSorted
                        ? sort.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                      : undefined
                  }
                  className={`whitespace-nowrap text-muted-foreground ${col.className ?? ""}`}
                >
                  {col.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col.id)}
                      aria-label={t("sortBy", { column: label })}
                      className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                    >
                      {label}
                      {isSorted ? (
                        sort.dir === "asc" ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : (
                          <ArrowDown className="h-3 w-3" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </button>
                  ) : (
                    label
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>

        <TableBody>
          {rows.length === 0 ? (
            <TableRow className="border-border hover:bg-transparent">
              <TableCell
                colSpan={columns.length}
                className="py-12 text-center text-sm text-muted-foreground"
              >
                {t("empty")}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((deal) => (
              <TableRow
                key={deal.id}
                tabIndex={0}
                onClick={() => onEditDeal(deal)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onEditDeal(deal);
                  }
                }}
                className="cursor-pointer border-border hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
              >
                {columns.map((col) => (
                  <TableCell
                    key={col.id}
                    className={`whitespace-nowrap text-sm text-muted-foreground ${col.className ?? ""}`}
                  >
                    {col.cell(deal)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground">
        <span>
          {t("showing", {
            from: sorted.length === 0 ? 0 : start + 1,
            to: start + rows.length,
            total: sorted.length,
          })}
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
            className="border-border"
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            {t("previous")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages - 1}
            onClick={() => setPage(currentPage + 1)}
            className="border-border"
          >
            {t("next")}
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}