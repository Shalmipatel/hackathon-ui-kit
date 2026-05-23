import React, { useState, useEffect, Suspense, lazy } from 'react';
import { theme } from '@/components/theme';
import { getGateway } from '@/features/app/bootstrap/providers';
import type { VioSearchResponse } from '@/features/vio/vio-types';
import { VioErrorBoundary } from './VioErrorBoundary';
import { VioSearchingBox, VioSearchingSpinner } from './VioHotels.styles';

const VioHotelSearchResults = lazy(() => import('@/features/vio/VioHotelSearchResults'));

interface VioFileLoaderProps {
  url: string;
}

export const VioFileLoader: React.FC<VioFileLoaderProps> = React.memo(({ url }) => {
  const [data, setData] = useState<VioSearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const gateway = getGateway();
        const fullUrl = url.startsWith('http')
          ? url
          : `${window.location.origin}${url.startsWith('/') ? url : `/${url}`}`;

        const resp = await gateway.request(fullUrl, { method: 'GET' });
        const json = (await resp.json()) as VioSearchResponse;

        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load hotel data');
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [url]);

  if (loading) {
    return (
      <VioSearchingBox>
        <VioSearchingSpinner />
        Loading hotel results...
      </VioSearchingBox>
    );
  }

  if (error) {
    return (
      <div
        style={{
          padding: 12,
          fontSize: 13,
          color: '#71717a',
          background: '#f4f4f5',
          borderRadius: 8,
        }}
      >
        Failed to load hotel results: {error}
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <VioErrorBoundary>
      <Suspense
        fallback={
          <div style={{ padding: 16, color: theme.colors.textSecondary, fontSize: 13 }}>
            Loading hotel results...
          </div>
        }
      >
        <VioHotelSearchResults data={data} isStreaming={false} />
      </Suspense>
    </VioErrorBoundary>
  );
});

VioFileLoader.displayName = 'VioFileLoader';

export default VioFileLoader;
