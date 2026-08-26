// import { useRemoteOptions, type RemoteOption } from '@/hooks/use-remote-options';

// export type Producto = RemoteOption;

// export function useProductos() {
//   const { options, loading, error } = useRemoteOptions('/api/productos', 'productos');
//   return { productos: options, loading, error };
// }

import { useRemoteOptions, type RemoteOption } from '@/hooks/use-remote-options';

export interface Producto extends RemoteOption {
  precioBase: {
    amount: number;
    currencyCode: string;
  } | null;
}

export function useProductos() {
  const { options, loading, error } = useRemoteOptions<Producto>(
    '/api/productos',
    'productos',
  );
  return { productos: options, loading, error };
}