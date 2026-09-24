import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

interface UpstreamProducto {
  id: string;
  name: string;
  precioBase?: {
    amountMicros: number | null;
    currencyCode: string;
  } | null;
}

export async function GET() {
  try {
    const ctx = await requireRole('agent');
    const limit = checkRateLimit(`crm:productos:${ctx.userId}`, RATE_LIMITS.crmLookup);
    if (!limit.success) return rateLimitResponse(limit);

  const token = process.env.MAJOIS_CRM_API_TOKEN;
  const url = process.env.PRODUCTOS_API_URL;

  if (!token || !url) {
    console.error('MAJOIS_CRM_API_TOKEN o PRODUCTOS_API_URL no están configurados');
    return NextResponse.json(
      { error: 'Server misconfigured' },
      { status: 500 },
    );
  }

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream error: ${res.status}` },
        { status: 502 },
      );
    }

    const json = await res.json();
    const rows: UpstreamProducto[] = json?.data?.productos ?? [];

    const productos = rows
      .filter((p) => p?.id && p?.name)
      // .map((p) => ({ id: p.id, name: p.name }));
      .map((p) => ({
        id: p.id,
        name: p.name,
        precioBase:
          p.precioBase && typeof p.precioBase.amountMicros === 'number'
            ? {
                amount: p.precioBase.amountMicros / 1_000_000,
                currencyCode: p.precioBase.currencyCode,
              }
            : null,
      }));

    return NextResponse.json({ productos });
  } catch (err) {
    if (err instanceof Error && (err.name === 'UnauthorizedError' || err.name === 'ForbiddenError')) {
      return toErrorResponse(err);
    }
    console.error('Failed to fetch productos', err);
    return NextResponse.json(
      { error: 'Failed to fetch productos' },
      { status: 502 },
    );
  }
  } catch (err) {
    return toErrorResponse(err);
  }
}