"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { useCan } from "@/hooks/use-can";
import type { Contact, Deal, ContactNote, Tag } from "@/types";
import { toast } from "sonner";
import { validarIdentificacionEcuador } from "@/lib/contacts/cedula-validator";
import { isUniqueViolation } from "@/lib/contacts/dedupe";
import { checkVentasByCedula } from "@/lib/contacts/check-ventas";
import {
  Phone,
  Mail,
  Copy,
  Check,
  User,
  Tag as TagIcon,
  DollarSign,
  StickyNote,
  Plus,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { useTranslations } from "next-intl";

interface ContactSidebarProps {
  contact: Contact | null;
  onContactUpdated?: (contact: Contact) => void;
}

function ContactQuickEdit({
  contact,
  onUpdated,
}: {
  contact: Contact;
  onUpdated?: (contact: Contact) => void;
}) {
  const t = useTranslations("Inbox.sidebar");
  const canEdit = useCan("send-messages");
  const [identificacion, setIdentificacion] = useState(contact.identificacion ?? "");
  const [nombreCompleto, setNombreCompleto] = useState(contact.nombre_completo ?? "");
  const [email, setEmail] = useState(contact.email ?? "");
  const [saving, setSaving] = useState(false);
  const [identificacionError, setIdentificacionError] = useState("");
  const lastCheckedCedulaRef = useRef<string | null>(null);

  const dirty =
    identificacion.trim() !== (contact.identificacion ?? "") ||
    nombreCompleto.trim() !== (contact.nombre_completo ?? "") ||
    email.trim() !== (contact.email ?? "");

  async function handleIdentificacionBlur() {
    const ced = identificacion.trim();
    if (!ced) {
      setIdentificacionError("");
      return;
    }
    if (!validarIdentificacionEcuador(ced)) {
      setIdentificacionError(t("identificacionInvalid"));
      return;
    }
    setIdentificacionError("");

    if (lastCheckedCedulaRef.current === ced) return;
    lastCheckedCedulaRef.current = ced;

    const count = await checkVentasByCedula(ced);
    if (count && count > 0) {
      toast.warning(t("toastVentasPrevias", { cedula: ced, count }), {
        duration: 10000,
      });
    }
  }
  

  async function handleSave() {
    const ced = identificacion.trim();
    const mail = email.trim();

    if (ced && !validarIdentificacionEcuador(ced)) {
      setIdentificacionError(t("identificacionInvalid"));
      toast.error(t("identificacionInvalid"));
      return;
    }
    if (mail && !/^\S+@\S+\.\S+$/.test(mail)) {
      toast.error(t("emailInvalid"));
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("contacts")
      .update({
        identificacion: ced || null,
        nombre_completo: nombreCompleto.trim() || null,
        email: mail || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", contact.id)
      .select()
      .single();
    setSaving(false);

    if (error || !data) {
      toast.error(isUniqueViolation(error) ? t("identificacionDuplicate") : t("toastSaveFailed"));
      return;
    }
    toast.success(t("toastSaved"));
    onUpdated?.({ ...contact, ...data });
  }

  const inputClass =
    "w-full rounded-lg border border-border bg-muted px-3 py-1.5 text-xs text-foreground placeholder-muted-foreground outline-none focus:border-primary/50 disabled:opacity-60";

  return (
    <div>
      <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <User className="h-3 w-3" />
        {t("quickEditTitle")}
      </div>
      <div className="mt-2 space-y-2">
        <div className="space-y-1">
          <label className="px-1 text-[11px] text-muted-foreground">{t("identificacion")}</label>
          <input
            value={identificacion}
            onChange={(e) => {
              setIdentificacion(e.target.value);
              if (identificacionError) setIdentificacionError("");
            }}
            onBlur={handleIdentificacionBlur}
            maxLength={13}
            inputMode="numeric"
            disabled={!canEdit}
            placeholder={t("identificacionPlaceholder")}
            className={inputClass}
          />
          {identificacionError && (
            <p className="px-1 text-xs text-red-400">{identificacionError}</p>
          )}
        </div>
        <div className="space-y-1">
          <label className="px-1 text-[11px] text-muted-foreground">{t("nombreCompleto")}</label>
          <input
            value={nombreCompleto}
            onChange={(e) => setNombreCompleto(e.target.value)}
            disabled={!canEdit}
            placeholder={t("nombreCompletoPlaceholder")}
            className={inputClass}
          />
        </div>
        <div className="space-y-1">
          <label className="px-1 text-[11px] text-muted-foreground">{t("email")}</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={!canEdit}
            placeholder="correo@ejemplo.com"
            className={inputClass}
          />
        </div>
        <Button
          size="sm"
          className="w-full bg-primary hover:bg-primary/90"
          onClick={handleSave}
          disabled={!canEdit || !dirty || saving || !!identificacionError}
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : t("save")}
        </Button>
      </div>
    </div>
  );
}

export function ContactSidebar({ contact, onContactUpdated }: ContactSidebarProps) {
  const tSidebar = useTranslations("Inbox.sidebar");
  const tThread = useTranslations("Inbox.messageThread");

  const { accountId } = useAuth();
  const [copied, setCopied] = useState(false);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [tags, setTags] = useState<(Tag & { contact_tag_id: string })[]>([]);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  const fetchContactData = useCallback(async () => {
    if (!contact) return;

    const supabase = createClient();

    // Fetch deals, notes, and tags in parallel
    const [dealsRes, notesRes, tagsRes] = await Promise.all([
      supabase
        .from("deals")
        .select("*, stage:pipeline_stages(*)")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_notes")
        .select("*")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_tags")
        .select("id, tag_id, tags(*)")
        .eq("contact_id", contact.id),
    ]);

    if (dealsRes.data) setDeals(dealsRes.data);
    if (notesRes.data) setNotes(notesRes.data);
    if (tagsRes.data) {
      const mapped = tagsRes.data
        .filter((ct: Record<string, unknown>) => ct.tags)
        .map((ct: Record<string, unknown>) => ({
          ...(ct.tags as Tag),
          contact_tag_id: ct.id as string,
        }));
      setTags(mapped);
    }
  }, [contact]);

  // Load on contact change. setContactData/setTags run inside async
  // Supabase callbacks, not synchronously in the effect body.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchContactData();
  }, [fetchContactData]);

  const handleCopyPhone = useCallback(async () => {
    if (!contact?.phone) return;
    await navigator.clipboard.writeText(contact.phone);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    // Dep is the whole `contact` object (not `contact?.phone`) so the
    // React Compiler's inference agrees with the manual dep list —
    // fixes the `preserve-manual-memoization` lint error.
  }, [contact]);

  const handleAddNote = useCallback(async () => {
    if (!contact || !newNote.trim()) return;
    if (!accountId) return;
    setAddingNote(true);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;

    const { data, error } = await supabase
      .from("contact_notes")
      .insert({
        contact_id: contact.id,
        account_id: accountId,
        user_id: user?.id,
        note_text: newNote.trim(),
      })
      .select()
      .single();

    if (!error && data) {
      setNotes((prev) => [data, ...prev]);
      setNewNote("");
    }
    setAddingNote(false);
  }, [contact, newNote, accountId]);

  if (!contact) {
    return (
      <div className="flex h-full w-70 items-center justify-center border-l border-border bg-card">
        <p className="text-sm text-muted-foreground">{tThread("selectConversation")}</p>
      </div>
    );
  }

  const displayName = contact.name || contact.phone;
  const initials = displayName.charAt(0).toUpperCase();

  return (
    <div className="flex h-full w-70 flex-col border-l border-border bg-card">
      <ScrollArea className="flex-1">
        <div className="p-4">
          {/* Contact Info */}
          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-lg font-semibold text-foreground">
              {contact.avatar_url ? (
                <img
                  src={contact.avatar_url}
                  alt={displayName}
                  className="h-16 w-16 rounded-full object-cover"
                />
              ) : (
                initials
              )}
            </div>
            <h3 className="mt-3 text-sm font-semibold text-foreground">
              {displayName}
            </h3>
            {contact.company && (
              <p className="text-xs text-muted-foreground">{contact.company}</p>
            )}
          </div>

          {/* Phone */}
          <div className="mt-4 space-y-2">
            <button
              onClick={handleCopyPhone}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
            >
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 text-left">{contact.phone}</span>
              {copied ? (
                <Check className="h-3 w-3 text-primary" />
              ) : (
                <Copy className="h-3 w-3 text-muted-foreground" />
              )}
            </button>

          </div>

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* Datos del cliente: edición rápida */}
          <ContactQuickEdit
            key={`${contact.id}-${contact.updated_at}`}
            contact={contact}
            onUpdated={onContactUpdated}
          />          

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* Tags */}
          <div>
            <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <TagIcon className="h-3 w-3" />
              {tSidebar("tags")}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {tags.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">{tSidebar("noTags")}</p>
              ) : (
                tags.map((tag) => (
                  <span
                    key={tag.contact_tag_id}
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: `${tag.color}20`,
                      color: tag.color,
                    }}
                  >
                    {tag.name}
                  </span>
                ))
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* Active Deals */}
          <div>
            <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <DollarSign className="h-3 w-3" />
              {tSidebar("deals")}
            </div>
            <div className="mt-2 space-y-2">
              {deals.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">{tSidebar("noDeals")}</p>
              ) : (
                deals.map((deal) => (
                  <div
                    key={deal.id}
                    className="rounded-lg bg-muted px-3 py-2"
                  >
                    <p className="text-sm font-medium text-foreground">
                      {deal.title}
                    </p>
                    <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {deal.currency ?? "$"}
                        {deal.value.toLocaleString()}
                      </span>
                      {deal.stage && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px]"
                          style={{
                            backgroundColor: `${deal.stage.color}20`,
                            color: deal.stage.color,
                          }}
                        >
                          {deal.stage.name}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* Notes */}
          <div>
            <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <StickyNote className="h-3 w-3" />
              {tSidebar("notes")}
            </div>
            <div className="mt-2">
              <div className="flex gap-2">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder={tSidebar("addNotePlaceholder")}
                  rows={2}
                  className="flex-1 resize-none rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground placeholder-muted-foreground outline-none focus:border-primary/50"
                />
                <Button
                  size="sm"
                  className="h-auto bg-primary px-2 hover:bg-primary/90"
                  onClick={handleAddNote}
                  disabled={!newNote.trim() || addingNote}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>

              <div className="mt-2 space-y-2">
                {notes.map((note) => (
                  <div
                    key={note.id}
                    className="rounded-lg bg-muted px-3 py-2"
                  >
                    <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                      {note.note_text}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {format(new Date(note.created_at), "MMM d, yyyy HH:mm")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
