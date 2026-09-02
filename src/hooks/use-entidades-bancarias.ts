import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { EntidadBancaria } from '@/types';

export function useEntidadesBancarias() {
  const [entidades, setEntidades] = useState<EntidadBancaria[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from('entidades_bancarias')
        .select('*')
        .order('nombre');
      if (!cancelled) setEntidades(data ?? []);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { entidades, loading };
}