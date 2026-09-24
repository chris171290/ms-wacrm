import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

interface UpstreamOpportunity {
  id: string;
}

interface UpstreamPerson {
  ci?: string;
  pointOfContactForOpportunities?: UpstreamOpportunity[];
}

export async function GET(request: Request) {
  try {
    const ctx = await requireRole('agent');
    const limit = checkRateLimit(`crm:check-ventas:${ctx.userId}`, RATE_LIMITS.crmLookup);
    if (!limit.success) return rateLimitResponse(limit);

  const { searchParams } = new URL(request.url);
  const ci = searchParams.get('ci');

  if (!ci || !/^\d{5,20}$/.test(ci)) {
    return NextResponse.json({ error: 'Invalid ci' }, { status: 400 });
  }

  const token = process.env.MAJOIS_CRM_API_TOKEN;
  if (!token) {
    console.error('MAJOIS_CRM_API_TOKEN no está configurado');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  // El valor del filtro se arma con la cédula recibida y se codifica
  // completo — encodeURIComponent escapa corchetes, comillas y dos
  // puntos de forma segura sin depender de construir el string a mano.
  const filterValue = `ci[eq]:"${ci}"`;
  const url = `https://ecufonemire.majoissolutions.com/rest/people?filter=${encodeURIComponent(filterValue)}&depth=1`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream error: ${res.status}` },
        { status: 502 },
      );
    }

    const json = await res.json();
    const people: UpstreamPerson[] = json?.data?.people ?? [];

    // Suma las ventas (pointOfContactForOpportunities) de todas las
    // personas que matchean esa cédula — normalmente será una sola,
    // pero sumamos por seguridad si el CRM llegara a tener duplicados.
    const count = people.reduce(
      (sum, p) =>
        sum + (Array.isArray(p.pointOfContactForOpportunities)
          ? p.pointOfContactForOpportunities.length
          : 0),
      0,
    );

    return NextResponse.json({ count, found: people.length > 0 });
  } catch (err) {
    console.error('Failed to check ventas by cedula', err);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 502 });
  }
  } catch (err) {
    return toErrorResponse(err);
  }
}