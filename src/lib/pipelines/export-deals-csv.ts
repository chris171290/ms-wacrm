import type { Deal, PipelineStage } from "@/types";

// Excel con configuración regional en español (Ecuador) espera ";" como
// separador de columnas y "," como decimal. Si tu equipo usa Excel en inglés,
// cambia estas dos constantes a "," y ".".
export const CSV_DELIMITER = ";";
const CSV_DECIMAL = ",";

export const DEALS_CSV_COLUMNS = [
  "client",
  "identification",
  "product",
  "value",
  "currency",
  "stage",
  "status",
  "assignee",
  "saleType",
  "carrier",
  "salesOrder",
  "activationDate",
  "createdAt",
] as const;
export type DealsCsvColumnId = (typeof DEALS_CSV_COLUMNS)[number];

export interface DealsCsvLabels {
  headers: Record<DealsCsvColumnId, string>;
  status: Record<"open" | "won" | "lost", string>;
}

function quoteIfNeeded(text: string): string {
  return /["\r\n]/.test(text) || text.includes(CSV_DELIMITER)
    ? `"${text.replace(/"/g, '""')}"`
    : text;
}

/**
 * Celda segura. Los textos que empiezan con = + - @ (o tab/CR) se prefijan con
 * una comilla simple para que Excel/Sheets no los ejecuten como fórmula
 * ("CSV injection": nombres o notas escritos por usuarios).
 */
export function csvCell(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? String(raw).replace(".", CSV_DECIMAL) : "";
  }
  const text = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return quoteIfNeeded(text);
}

/**
 * Identificadores solo de dígitos (cédula, RUC, orden de venta): Excel los
 * convertiría a número y se perdería el cero inicial. Se envían como ="…",
 * que Excel/Sheets/LibreOffice muestran como texto. Seguro contra inyección
 * porque solo se aplica si el valor son únicamente dígitos.
 */
function textCell(raw: string | null | undefined): string {
  if (raw && /^\d+$/.test(raw)) return quoteIfNeeded(`="${raw}"`);
  return csvCell(raw);
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** ISO (UTC) → "YYYY-MM-DD HH:mm" en hora local del navegador. */
function localDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function buildDealsCsv(
  deals: Deal[],
  stages: PipelineStage[],
  labels: DealsCsvLabels,
): string {
  const stageName = new Map(stages.map((s) => [s.id, s.name]));

  const header = DEALS_CSV_COLUMNS.map((id) => csvCell(labels.headers[id])).join(
    CSV_DELIMITER,
  );

  const rows = deals.map((d) => {
    const cells: Record<DealsCsvColumnId, string> = {
      client: csvCell(d.contact?.nombre_completo?.trim() || d.contact?.name || d.title),
      identification: textCell(d.contact?.identificacion),
      product: csvCell(d.producto_nombre),
      value: csvCell(d.value),
      currency: csvCell(d.currency),
      stage: csvCell(stageName.get(d.stage_id)),
      status: csvCell(labels.status[d.status ?? "open"]),
      assignee: csvCell(d.assignee?.full_name),
      saleType: csvCell(d.tipo_de_venta),
      carrier: csvCell(d.operadora),
      salesOrder: textCell(d.orden_de_venta),
      activationDate: csvCell(d.fecha_alta), // ya es "YYYY-MM-DD"
      createdAt: csvCell(localDateTime(d.created_at)),
    };
    return DEALS_CSV_COLUMNS.map((id) => cells[id]).join(CSV_DELIMITER);
  });

  return [header, ...rows].join("\r\n");
}

/** negocios-<pipeline>-YYYY-MM-DD.csv, sin tildes ni caracteres raros. */
export function buildDealsCsvFilename(pipelineName: string | undefined, now = new Date()): string {
  const slug = (pipelineName ?? "pipeline")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `negocios-${slug || "pipeline"}-${date}.csv`;
}