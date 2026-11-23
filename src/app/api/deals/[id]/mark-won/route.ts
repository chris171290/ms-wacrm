import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import {
  createTwentyOpportunity,
  findOrCreateTwentyPerson,
  findTwentyWorkspaceMemberByEmail,
  updateTwentyOpportunity,
  type CreateOpportunityInput,
} from "@/lib/crm/twenty";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requireRole("agent");
    const { id: dealId } = await params;

    const { data: deal, error } = await supabase
      .from("deals")
      .select("*, contact:contacts(*), assignee:profiles!deals_assigned_to_fkey(email)")
      .eq("id", dealId)
      .maybeSingle();

    if (error) {
      console.error("[deals/mark-won] load error:", error);
      return NextResponse.json({ error: "Failed to load deal" }, { status: 500 });
    }
    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    // Idempotencia: un deal ya integrado no se vuelve a enviar a Twenty.
    // Para re-sincronizar hay que desbloquearlo primero.
    if (deal.esta_integrado) {
      return NextResponse.json(
        {
          error: "Este negocio ya está integrado con Majois CRM.",
          twentyOpportunityId: deal.twenty_opportunity_id ?? null,
        },
        { status: 409 },
      );
    }

    const missing: string[] = [];
    if (!deal.producto_id) missing.push("producto");
    if (!deal.contact_id || !deal.contact) missing.push("contacto");
    if (!deal.value || deal.value <= 0) missing.push("valor");
    if (!deal.currency) missing.push("moneda");
    if (!deal.stage_id) missing.push("etapa");
    if (!deal.assigned_to) missing.push("asignado_a");
    if (!deal.direccion_completa) missing.push("direccion_completa");
    if (!deal.forma_de_pago) missing.push("forma_de_pago");
    if (!deal.orden_de_venta) missing.push("orden_de_venta");
    if (!deal.fecha_alta) missing.push("fecha_alta");
    if (!deal.tipo_de_venta) missing.push("tipo_de_venta");
    if (!deal.operadora) missing.push("operadora");
    if (!deal.contact?.identificacion) missing.push("contacto.identificacion");
    if (!deal.contact?.nombre_completo?.trim()) missing.push("contacto.nombre_completo");

    if (missing.length > 0) {
      return NextResponse.json({ error: "Faltan campos obligatorios", missing }, { status: 400 });
    }

    // ownerId es obligatorio: es como Twenty identifica a quién pertenece la
    // venta. Se resuelve ANTES de tocar nada para no dejar datos huérfanos.
    let owner: { id: string } | null;
    try {
      owner = deal.assignee?.email
        ? await findTwentyWorkspaceMemberByEmail(deal.assignee.email)
        : null;
    } catch (err) {
      console.error("[deals/mark-won] Twenty owner lookup failed:", err);
      return NextResponse.json(
        { error: "No se pudo consultar el responsable en Majois CRM. El negocio no se marcó como ganado." },
        { status: 502 },
      );
    }
    if (!owner) {
      return NextResponse.json(
        {
          error:
            "El agente asignado no tiene un usuario con el mismo correo en Majois CRM. El negocio no se marcó como ganado.",
        },
        { status: 422 },
      );
    }

    // Reserva atómica: solo UNA petición logra pasar de esta_integrado=false a
    // true. Un doble clic o un reintento simultáneo recibe 409 y no crea nada.
    const { data: claimed, error: claimError } = await supabase
      .from("deals")
      .update({ esta_integrado: true })
      .eq("id", dealId)
      .eq("esta_integrado", false)
      .select("id");
    if (claimError || !claimed || claimed.length === 0) {
      return NextResponse.json(
        { error: "Este negocio ya se está integrando o fue integrado por otra persona." },
        { status: 409 },
      );
    }

    const clientName = deal.contact.nombre_completo.trim();

    let person: { id: string };
    let opportunity: { id: string };
    let updatedExisting = false;
    try {
      person = await findOrCreateTwentyPerson({
        name: clientName,
        identificacion: deal.contact.identificacion,
        phone: deal.contact.phone,
        email: deal.contact.email,
        mesh: deal.mesh,
        direccionCompleta: deal.direccion_completa,
        googleMapsLink: deal.google_maps_link,
      });

      const payload: CreateOpportunityInput = {
        contactName: clientName,
        pointOfContactId: person.id,
        productoId: deal.producto_id,
        amount: deal.value,
        currency: deal.currency,
        formaDePago: deal.forma_de_pago,
        icc: deal.icc,
        mesh: deal.mesh,
        direccionCompleta: deal.direccion_completa,
        googleMapsLink: deal.google_maps_link,
        ordenDeVenta: deal.orden_de_venta,
        ownerId: owner.id,
        tipoDeVenta: deal.tipo_de_venta,
        operadora: deal.operadora,
        fechaAlta: deal.fecha_alta,
        celularAsignado: deal.celular_asignado,
        ci: deal.contact.identificacion,
      };

      // Re-integración (deal desbloqueado): se actualiza la oportunidad que ya
      // existe en lugar de crear otra. Si Twenty ya no la tiene, se crea.
      const existing = deal.twenty_opportunity_id
        ? await updateTwentyOpportunity(deal.twenty_opportunity_id, payload)
        : null;

      if (existing) {
        opportunity = existing;
        updatedExisting = true;
      } else {
        opportunity = await createTwentyOpportunity(payload);
      }
    } catch (err) {
      console.error("[deals/mark-won] Twenty sync failed:", err);
      // Libera la reserva: el deal queda abierto para corregir y reintentar.
      await supabase.from("deals").update({ esta_integrado: false }).eq("id", dealId);
      return NextResponse.json(
        { error: "No se pudo sincronizar con Majois CRM. El negocio no se marcó como ganado." },
        { status: 502 },
      );
    }

    const { error: updateError } = await supabase
      .from("deals")
      .update({ status: "won", twenty_opportunity_id: opportunity.id })
      .eq("id", dealId);
    if (updateError) {
      console.error("[deals/mark-won] status update error:", updateError);
      return NextResponse.json(
        {
          error: "Se sincronizó con Majois CRM pero no se pudo actualizar el estado del negocio. Contacta soporte.",
          twentyPersonId: person.id,
          twentyOpportunityId: opportunity.id,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      updatedExisting,
      twentyPersonId: person.id,
      twentyOpportunityId: opportunity.id,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}