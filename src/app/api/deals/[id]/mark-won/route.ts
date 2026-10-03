import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { createTwentyPerson, createTwentyOpportunity, findTwentyWorkspaceMemberByEmail } from "@/lib/crm/twenty";
import { convertSegmentPathToStaticExportFilename } from "next/dist/shared/lib/segment-cache/segment-value-encoding";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requireRole("agent");
    const { id: dealId } = await params;

    const { data: deal, error } = await supabase
      .from("deals")
      //.select("*, contact:contacts(*)")
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

    console.log(deal)

    const missing: string[] = [];
    if (!deal.producto_id) missing.push("producto");
    if (!deal.contact_id || !deal.contact) missing.push("contacto");
    if (!deal.value || deal.value <= 0) missing.push("valor");
    if (!deal.currency) missing.push("moneda");
    if (!deal.stage_id) missing.push("etapa");
    if (!deal.assigned_to) missing.push("asignado_a");
    if (!deal.direccion_completa) missing.push("direccion_completa");
    if (!deal.google_maps_link) missing.push("google_maps_link");
    if (!deal.forma_de_pago) missing.push("forma_de_pago");
    if (!deal.orden_de_venta) missing.push("orden_de_venta");

    console.log(missing)

    if (missing.length > 0) {
      return NextResponse.json({ error: "Faltan campos obligatorios", missing }, { status: 400 });
    }

    let person: { id: string };
    let opportunity: { id: string };
    try {
      console.log(deal.assignee.email)
      const owner = deal.assignee?.email
        ? await findTwentyWorkspaceMemberByEmail(deal.assignee.email)
        : null;

      person = await createTwentyPerson({
        name: deal.contact.name || deal.contact.phone,
        identificacion: deal.contact.identificacion,
        phone: deal.contact.phone,
        email: deal.contact.email,
        mesh: deal.mesh,
        formaDePago: deal.forma_de_pago,
        direccionCompleta: deal.direccion_completa,
        googleMapsLink: deal.google_maps_link,
      });

      opportunity = await createTwentyOpportunity({
        contactName: deal.contact.name || deal.contact.phone,
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
        ownerId: owner?.id ?? null,
        tipoDeVenta: deal.tipo_de_venta,
        operadora: deal.operadora,
      });
    } catch (err) {
      console.error("[deals/mark-won] Twenty sync failed:", err);
      // El deal NO se toca — queda "open" para poder corregir y reintentar.
      return NextResponse.json(
        { error: "No se pudo sincronizar con Twenty. El negocio no se marcó como ganado." },
        { status: 502 },
      );
    }

    const { error: updateError } = await supabase.from("deals").update({ status: "won" }).eq("id", dealId);
    if (updateError) {
      console.error("[deals/mark-won] status update error:", updateError);
      return NextResponse.json(
        {
          error: "Se creó en Twenty pero no se pudo actualizar el estado del negocio. Contacta soporte.",
          twentyPersonId: person.id,
          twentyOpportunityId: opportunity.id,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, twentyPersonId: person.id, twentyOpportunityId: opportunity.id });
  } catch (err) {
    return toErrorResponse(err);
  }
}