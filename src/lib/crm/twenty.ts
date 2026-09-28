import { parsePhoneNumberFromString } from "libphonenumber-js";
// Server-only. Crea el cliente (Person) y la venta (Opportunity) en
// Twenty cuando un deal se marca como ganado.

const TWENTY_BASE_URL = "https://ecufonemire.majoissolutions.com";

function authHeaders() {
  const token = process.env.MAJOIS_CRM_API_TOKEN;
  if (!token) throw new Error("MAJOIS_CRM_API_TOKEN no está configurado");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

// TODO: confirmar valores exactos — solo "EFECTIVO" está verificado
// contra un registro real de Twenty.
const FORMA_PAGO_TO_TWENTY: Record<string, string> = {
  "Efectivo": "EFECTIVO",
  "Tarjeta de crédito/débito": "OTROS",
  "Transferencia bancaria": "ENTIDAD_BANCARIA",
};

export function mapFormaDePago(value: string | null | undefined) {
  if (!value) return null;
  return FORMA_PAGO_TO_TWENTY[value] ?? null;
}

function extractLatLng(mapsLink: string | null | undefined) {
  if (!mapsLink) return { lat: null, lng: null };
  const at = mapsLink.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (at) return { lat: Number(at[1]), lng: Number(at[2]) };
  const q = mapsLink.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (q) return { lat: Number(q[1]), lng: Number(q[2]) };
  return { lat: null, lng: null };
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return parts.length === 1
    ? { firstName: parts[0], lastName: "" }
    : { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

// Twenty valida el teléfono con el código de país separado del número
// nacional, no como un solo string. Si no se puede parsear de forma
// confiable, es más seguro mandarlo vacío que mandar algo inválido
// y tumbar la creación del cliente.
function parsePhone(phone: string | null | undefined) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return { number: "", countryCode: "", callingCode: "" };

  const parsed = parsePhoneNumberFromString(`+${digits}`);
  if (!parsed || !parsed.isValid()) {
    return { number: "", countryCode: "", callingCode: "" };
  }
  return {
    number: parsed.nationalNumber,
    countryCode: parsed.country ?? "",
    callingCode: `+${parsed.countryCallingCode}`,
  };
}

function buildDireccionCliente(direccionCompleta?: string | null, googleMapsLink?: string | null) {
  const { lat, lng } = extractLatLng(googleMapsLink);
  return {
    addressStreet1: direccionCompleta ?? "",
    addressStreet2: "",
    addressCity: "",
    addressPostcode: "",
    addressState: "",
    addressCountry: "Ecuador",
    addressLat: lat,
    addressLng: lng,
  };
}

export interface CreatePersonInput {
  name: string;
  identificacion: string;
  phone?: string | null;
  email?: string | null;
  mesh?: boolean | null;
  formaDePago?: string | null;
  direccionCompleta?: string | null;
  googleMapsLink?: string | null;
}

export async function createTwentyPerson(input: CreatePersonInput) {
  const { firstName, lastName } = splitName(input.name);
  const phone = parsePhone(input.phone);
  const body = {
    name: { firstName, lastName },
    ci: input.identificacion,
    emails: { primaryEmail: input.email ?? "", additionalEmails: [] },
    phones: {
      primaryPhoneNumber: phone.number,
      primaryPhoneCountryCode: phone.countryCode,
      primaryPhoneCallingCode: phone.callingCode,
      additionalPhones: [],
    },
    mesh: input.mesh ?? null,
    formaDePago: mapFormaDePago(input.formaDePago),
    direccionCliente: buildDireccionCliente(input.direccionCompleta, input.googleMapsLink),
  };

  const res = await fetch(`${TWENTY_BASE_URL}/rest/people`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Twenty: error al crear persona (${res.status}): ${await res.text().catch(() => "")}`);
  }
  const json = await res.json();
  const person = json?.data?.createPerson ?? json;
  if (!person?.id) throw new Error("Twenty: persona creada sin id en la respuesta");
  return person as { id: string };
}

export interface CreateOpportunityInput {
  contactName: string;
  pointOfContactId: string;
  productoId: string;
  amount: number;
  currency: string;
  formaDePago?: string | null;
  icc?: string | null;
  mesh?: boolean | null;
  direccionCompleta?: string | null;
  googleMapsLink?: string | null;
  ordenDeVenta?: string | null;
}

function meshToTwentyText(mesh: boolean | null | undefined): "SI" | "NO" | null {
  if (mesh === null || mesh === undefined) return null;
  return mesh ? "SI" : "NO";
}



export async function createTwentyOpportunity(input: CreateOpportunityInput) {
  const body = {
    name: input.contactName,
    nombreDelContacto: input.contactName,
    pointOfContactId: input.pointOfContactId,
    productoId: input.productoId,
    amount: { amountMicros: Math.round(input.amount * 1_000_000), currencyCode: input.currency },
    formaDePago: mapFormaDePago(input.formaDePago),
    icc: { blocknote: null, markdown: input.icc ?? "" },
    mesh: meshToTwentyText(input.mesh),
    direccionCliente: buildDireccionCliente(input.direccionCompleta, input.googleMapsLink),
    ordenDeVenta: input.ordenDeVenta ?? null,
    stage: "FINALIZADO", // TODO: confirmar que este es el stage correcto para "ganado"
  };

  const res = await fetch(`${TWENTY_BASE_URL}/rest/opportunities`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Twenty: error al crear oportunidad (${res.status}): ${await res.text().catch(() => "")}`);
  }
  const json = await res.json();
  const opportunity = json?.data?.createOpportunity ?? json;
  if (!opportunity?.id) throw new Error("Twenty: oportunidad creada sin id en la respuesta");
  return opportunity as { id: string };
}