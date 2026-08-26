import { useState, useEffect } from 'react';

// export interface RemoteOption {
//   id: string;
//   name: string;
// }

// export function useRemoteOptions(endpoint: string, dataKey: string) {
//   const [options, setOptions] = useState<RemoteOption[]>([]);

export interface RemoteOption {
  id: string;
  name: string;
}

export function useRemoteOptions<T extends RemoteOption = RemoteOption>(
  endpoint: string,
  dataKey: string,
) {
  const [options, setOptions] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(false);
      try {
        const res = await fetch(endpoint);
        if (!res.ok) throw new Error('request failed');
        const data = await res.json();
        if (!cancelled) setOptions(data[dataKey] ?? []);
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
  }, [endpoint, dataKey]);

  return { options, loading, error };
}