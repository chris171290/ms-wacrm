export async function checkVentasByCedula(cedula: string): Promise<number | null> {
  try {
    const res = await fetch(`/api/crm/check-ventas?ci=${encodeURIComponent(cedula)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.count === 'number' ? data.count : null;
  } catch {
    return null;
  }
}