import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';

// No cachear a nivel de build; sí cacheamos la respuesta del upstream
// unos minutos para no pegarle a la API externa en cada apertura de modal.
export const dynamic = 'force-dynamic';

interface UpstreamCampana {
  id: string;
  name: string;
}

export async function GET() {
  try {
    const ctx = await requireRole('agent');
    const limit = checkRateLimit(`crm:campanas:${ctx.userId}`, RATE_LIMITS.crmLookup);
    if (!limit.success) return rateLimitResponse(limit);

  const token = process.env.MAJOIS_CRM_API_TOKEN;
  const url = process.env.CAMPANAS_API_URL;

  if (!token || !url) {
    console.error('MAJOIS_CRM_API_TOKEN o CAMPANAS_API_URL no están configurados');
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
      // Revalida cada 5 minutos en vez de pegarle al upstream en cada request
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream error: ${res.status}` },
        { status: 502 },
      );
    }

    const json = await res.json();
    const rows: UpstreamCampana[] = json?.data?.campanas ?? [];

    // Solo exponemos id + name al cliente. Nunca reenviamos el payload
    // completo (contiene workspaceMemberId, nombres de empleados, etc.)
    const campanas = rows
      .filter((c) => c?.id && c?.name)
      .map((c) => ({ id: c.id, name: c.name }));

    return NextResponse.json({ campanas });
  } catch (err) {
    if (err instanceof Error && (err.name === 'UnauthorizedError' || err.name === 'ForbiddenError')) {
      return toErrorResponse(err);
    }
    console.error('Failed to fetch campanas', err);
    return NextResponse.json(
      { error: 'Failed to fetch campanas' },
      { status: 502 },
    );
  }
  } catch (err) {
    return toErrorResponse(err);
  }
}