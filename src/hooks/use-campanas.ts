import { useState, useEffect } from 'react';

export interface Campana {
  id: string;
  name: string;
}

export function useCampanas() {
  const [campanas, setCampanas] = useState<Campana[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(false);
      try {
        const res = await fetch('/api/campanas');
        if (!res.ok) throw new Error('request failed');
        const data = await res.json();
        if (!cancelled) setCampanas(data.campanas ?? []);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { campanas, loading, error };
}