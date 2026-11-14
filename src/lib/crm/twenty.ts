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
const EMPTY_PHONE = { number: "", countryCode: "", callingCode: "" };

function parsePhone(phone: string | null | undefined) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return EMPTY_PHONE;

  // Acepta los dos formatos que existen en los contactos:
  //  - internacional sin "+": 593992273539 (WhatsApp)
  //  - nacional ecuatoriano: 0992273539 o 992273539 (captura manual)
  // Si es corto (hasta 10 dígitos) casi seguro es nacional, así que se
  // prueba primero con Ecuador para no confundir 992273539 con un
  // número de otro país.
  const candidates =
    digits.length <= 10
      ? [parsePhoneNumberFromString(digits, "EC"), parsePhoneNumberFromString(`+${digits}`)]
      : [parsePhoneNumberFromString(`+${digits}`), parsePhoneNumberFromString(digits, "EC")];

  const parsed = candidates.find((p) => p?.isValid());
  if (!parsed) {
    // Se envía vacío (Twenty rechaza con 400 los teléfonos inválidos),
    // pero ahora queda registro para poder corregir el contacto.
    console.warn(`[twenty] teléfono no válido, se envía vacío: "${phone}"`);
    return EMPTY_PHONE;
  }
  return {
    number: parsed.nationalNumber,          // "992273539"
    countryCode: parsed.country ?? "",      // "EC"
    callingCode: `+${parsed.countryCallingCode}`, // "+593"
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

// Busca un Person existente en Twenty por cédula (ci). Si ya existe,
// evita crear un cliente duplicado cada vez que se marca una venta
// como ganada para la misma persona.
export async function findTwentyPersonByCi(ci: string): Promise<{ id: string } | null> {
  const filter = `ci[eq]:"${ci}"`;
  const url = `${TWENTY_BASE_URL}/rest/people?filter=${encodeURIComponent(filter)}`;

  const res = await fetch(url, { method: "GET", headers: authHeaders() });
  if (!res.ok) {
    throw new Error(`Twenty: error al buscar persona (${res.status}): ${await res.text().catch(() => "")}`);
  }

  const json = await res.json();
  const person = json?.data?.people?.[0];
  return person?.id ? { id: person.id } : null;
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
    direccionDeCliente: buildDireccionCliente(input.direccionCompleta, input.googleMapsLink),
    cargaMasiva: false,
    estado: "CLIENTE_ACTIVO"
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


// Punto de entrada que usa mark-won: busca primero, crea solo si no existe.
export async function findOrCreateTwentyPerson(input: CreatePersonInput): Promise<{ id: string }> {
  const existing = await findTwentyPersonByCi(input.identificacion);
  if (existing) return existing;
  return createTwentyPerson(input);
}

export interface CreateOpportunityInput {
  contactName: string;
  pointOfContactId: string;
  productoId: string;
  amount: number;
  currency: string;
  formaDePago: string;
  icc?: string | null;
  mesh?: boolean | null;
  direccionCompleta: string;
  googleMapsLink?: string | null;
  ordenDeVenta: string;
  ownerId: string;
  tipoDeVenta: string;
  operadora: string;
  fechaAlta: string;
  ci: string;
  celularAsignado?: string | null;
}

function meshToTwentyText(mesh: boolean | null | undefined): "SI" | "NO" | null {
  if (mesh === null || mesh === undefined) return null;
  return mesh ? "SI" : "NO";
}

export async function findTwentyWorkspaceMemberByEmail(email: string): Promise<{ id: string } | null> {
  const filter = `userEmail[eq]:"${email}"`;
  const url = `${TWENTY_BASE_URL}/rest/workspaceMembers?filter=${encodeURIComponent(filter)}`;

  const res = await fetch(url, { method: "GET", headers: authHeaders() });
  if (!res.ok) {
    throw new Error(`Twenty: error al buscar workspaceMember (${res.status}): ${await res.text().catch(() => "")}`);
  }

  const json = await res.json();
  const member = json?.data?.workspaceMembers?.[0];
  return member?.id ? { id: member.id } : null;
}


export async function createTwentyOpportunity(input: CreateOpportunityInput) {
  const formaDePago = mapFormaDePago(input.formaDePago);
  const tipoDeVenta = mapTipoVenta(input.tipoDeVenta);
  const operadora = mapOperadora(input.operadora);

  const unmapped = [
    !formaDePago && `formaDePago "${input.formaDePago}"`,
    !tipoDeVenta && `tipoDeVenta "${input.tipoDeVenta}"`,
    !operadora && `operadora "${input.operadora}"`,
  ].filter(Boolean);
  if (unmapped.length > 0) {
    throw new Error(`Twenty: valores sin mapeo: ${unmapped.join(", ")}`);
  }

  const body = {
    name: input.contactName,
    nombreDelContacto: input.contactName,
    pointOfContactId: input.pointOfContactId,
    productoId: input.productoId,
    amount: { amountMicros: Math.round(input.amount * 1_000_000), currencyCode: input.currency },
    formaDePago: formaDePago,
    icc: { blocknote: null, markdown: input.icc ?? "" },
    mesh: meshToTwentyText(input.mesh),
    direccionCliente: buildDireccionCliente(input.direccionCompleta, input.googleMapsLink),
    ordenDeVenta: input.ordenDeVenta ?? null,
    ownerId: input.ownerId ?? null,
    fechaAltaEInstalacion: input.fechaAlta ?? null,
    tipoDeVenta,
    operadora,
    celularAsignado: input.celularAsignado?.trim() || null,
    ci: input.ci,
    equipo: "CALL_CENTER_NORTE",
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

function todayInEcuador(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// Mismo patrón que formaDePago: enum de texto en Twenty. Puse el
// valor más probable (mayúsculas, sin tildes, snake_case) siguiendo
// la convención que ya vimos en EFECTIVO/ENTIDAD_BANCARIA/OTROS y
// SI/NO — TODO: confirmar contra el error 400 de Twenty si no coincide.
const TIPO_VENTA_TO_TWENTY: Record<string, string> = {
  "Línea Nueva": "LINEA_NUEVA",
  "Portabilidad Prepago": "PORTABILIDAD_PREPAGO",
  "Portabilidad Pospago": "PORTABILIDAD_POSPAGO",
  "Migración": "MIGRACION",
};

const OPERADORA_TO_TWENTY: Record<string, string> = {
  "Claro": "CLARO",
  "Movistar": "MOVISTAR",
  "CNT": "CNT",
  "Tuenti": "TUENTI",
  "Tigo": "TIGO",
};

export function mapTipoVenta(value: string | null | undefined) {
  if (!value) return null;
  const mapped = TIPO_VENTA_TO_TWENTY[value];
  if (!mapped) throw new Error(`Twenty: tipo de venta sin mapeo: "${value}"`);
  return mapped;
}

export function mapOperadora(value: string | null | undefined) {
  if (!value) return null;
  const mapped = OPERADORA_TO_TWENTY[value];
  if (!mapped) throw new Error(`Twenty: operadora sin mapeo: "${value}"`);
  return mapped;
}