"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { FileText, Loader2, Paperclip, Trash2, Upload, X, Eye } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_PER_TYPE,
  DEAL_DOCUMENT_TYPES,
  isDealDocumentType,
  preflightFile,
  type AttachmentErrorCode,
  type DealDocumentType,
} from "@/lib/deals/attachments";
import type { StagedAttachment } from "@/lib/deals/attachments-client";

interface AttachmentRow {
  id: string;
  document_type: DealDocumentType;
  file_name: string;
  size_bytes: number;
}

interface DealAttachmentsProps {
  dealId: string | null;
  /** Solo lectura: se pueden ver los documentos, pero no subir ni borrar. */
  readOnly?: boolean;
  staged: StagedAttachment[];
  onStagedChange: (next: StagedAttachment[]) => void;
}

function formatBytes(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function DealAttachments({
  dealId,
  readOnly = false,
  staged,
  onStagedChange,
}: DealAttachmentsProps) {
  const t = useTranslations("Pipelines.form");
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const [documentType, setDocumentType] = useState<DealDocumentType | "">("");
  const [existing, setExisting] = useState<AttachmentRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const errorText = (code: AttachmentErrorCode | "select_type_first" | "open_failed" | "delete_failed") =>
    t(`attachments.errors.${code}` as string);

  const loadExisting = useCallback(async () => {
    if (!dealId) {
      setExisting([]);
      return;
    }
    const { data } = await supabase
      .from("deal_attachments")
      .select("id, document_type, file_name, size_bytes")
      .eq("deal_id", dealId)
      .order("created_at");
    setExisting((data ?? []) as AttachmentRow[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId]);

  useEffect(() => {
    void loadExisting();
  }, [loadExisting]);

  async function handleFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (!documentType) {
      toast.error(errorText("select_type_first"));
      return;
    }

    const next = [...staged];
    for (const file of files) {
      const used =
        existing.filter((a) => a.document_type === documentType).length +
        next.filter((s) => s.documentType === documentType).length;
      if (used >= ATTACHMENT_MAX_PER_TYPE) {
        toast.error(errorText("limit_reached"));
        break;
      }

      const check = await preflightFile(file);
      if (!check.ok) {
        toast.error(`${file.name}: ${errorText(check.code)}`);
        continue;
      }

      const isDuplicate = next.some(
        (s) =>
          s.file.name === file.name &&
          s.file.size === file.size &&
          s.file.lastModified === file.lastModified,
      );
      if (isDuplicate) {
        toast.error(`${file.name}: ${errorText("duplicate")}`);
        continue;
      }

      next.push({ key: crypto.randomUUID(), documentType, file });
    }
    onStagedChange(next);
  }

  async function handleView(attachmentId: string) {
    if (!dealId) return;
    setBusyId(attachmentId);
    // Se abre la pestaña de inmediato (dentro del clic) para que los
    // bloqueadores de popups no la cancelen tras el await.
    const tab = window.open("about:blank", "_blank");
    try {
      const res = await fetch(`/api/deals/${dealId}/attachments/${attachmentId}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.url) throw new Error("sign failed");
      if (tab) tab.location.href = json.url;
      else window.location.assign(json.url);
    } catch {
      tab?.close();
      toast.error(errorText("open_failed"));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(attachmentId: string) {
    if (!dealId) return;
    setBusyId(attachmentId);
    try {
      const res = await fetch(`/api/deals/${dealId}/attachments/${attachmentId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        const code = isErrorCode(json?.error) ? json.error : "delete_failed";
        toast.error(errorText(code));
        return;
      }
      toast.success(t("attachments.toastDeleted"));
      setConfirmId(null);
      await loadExisting();
    } finally {
      setBusyId(null);
    }
  }

  function typeLabel(type: DealDocumentType) {
    return t(`attachments.types.${type}` as string);
  }

  return (
    <div className="grid gap-3 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center gap-2">
        <Paperclip className="h-4 w-4 text-muted-foreground" />
        <Label className="text-muted-foreground">{t("attachments.title")}</Label>
      </div>

      {!readOnly && (
        <div className="grid gap-2">
          <select
            value={documentType}
            onChange={(e) =>
              setDocumentType(isDealDocumentType(e.target.value) ? e.target.value : "")
            }
            className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary"
          >
            <option value="">{t("attachments.selectType")}</option>
            {DEAL_DOCUMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {typeLabel(type)}
              </option>
            ))}
          </select>

          <input
            ref={inputRef}
            type="file"
            hidden
            multiple
            accept={ATTACHMENT_ACCEPT}
            onChange={handleFiles}
          />
          <Button
            type="button"
            variant="outline"
            disabled={!documentType}
            onClick={() => inputRef.current?.click()}
            className="w-full"
          >
            <Upload className="mr-2 h-4 w-4" />
            {t("attachments.chooseFile")}
          </Button>
          <p className="text-xs text-muted-foreground">{t("attachments.hint")}</p>
        </div>
      )}

      {existing.length > 0 && (
        <ul className="grid gap-1.5">
          {existing.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-2 text-sm"
            >
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-foreground">{a.file_name}</p>
                <p className="text-xs text-muted-foreground">
                  {typeLabel(a.document_type)} · {formatBytes(a.size_bytes)}
                </p>
              </div>

              {confirmId === a.id ? (
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-muted-foreground">{t("attachments.confirmDelete")}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={busyId === a.id}
                    onClick={() => handleDelete(a.id)}
                  >
                    {t("attachments.confirm")}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmId(null)}>
                    {t("attachments.cancel")}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    title={t("attachments.view")}
                    aria-label={t("attachments.view")}
                    disabled={busyId === a.id}
                    onClick={() => handleView(a.id)}
                  >
                    {busyId === a.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                  {!readOnly && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      title={t("attachments.delete")}
                      aria-label={t("attachments.delete")}
                      onClick={() => setConfirmId(a.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-400" />
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {staged.length > 0 && (
        <div className="grid gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">{t("attachments.pending")}</p>
          <ul className="grid gap-1.5">
            {staged.map((s) => (
              <li
                key={s.key}
                className="flex items-center gap-2 rounded-md border border-dashed border-border bg-background px-2.5 py-2 text-sm"
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-foreground">{s.file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {typeLabel(s.documentType)} · {formatBytes(s.file.size)}
                  </p>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={t("attachments.delete")}
                  onClick={() => onStagedChange(staged.filter((x) => x.key !== s.key))}
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function isErrorCode(value: unknown): value is AttachmentErrorCode {
  return typeof value === "string";
}