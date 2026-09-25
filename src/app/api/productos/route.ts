import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface UpstreamProducto {
  id: string;
  name: string;
  tarifaBasica?: {
    amountMicros: number | null;
    currencyCode: string;
  } | null;
}

export async function GET() {
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
          p.tarifaBasica && typeof p.tarifaBasica.amountMicros === 'number'
            ? {
                amount: p.tarifaBasica.amountMicros / 1_000_000,
                currencyCode: p.tarifaBasica.currencyCode,
              }
            : null,
      }));

    return NextResponse.json({ productos });
  } catch (err) {
    console.error('Failed to fetch productos', err);
    return NextResponse.json(
      { error: 'Failed to fetch productos' },
      { status: 502 },
    );
  }
}