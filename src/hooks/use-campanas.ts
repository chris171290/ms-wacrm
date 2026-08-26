import { useRemoteOptions, type RemoteOption } from '@/hooks/use-remote-options';

export type Campana = RemoteOption;

export function useCampanas() {
  const { options, loading, error } = useRemoteOptions('/api/campanas', 'campanas');
  return { campanas: options, loading, error };
}