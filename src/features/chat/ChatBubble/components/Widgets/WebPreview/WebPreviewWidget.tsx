import React, { useState, useEffect } from 'react';
import WebLinkPreview from '@/features/chat/WebLinkPreview';
import { parseWebPreviewJson } from './webPreviewUtils';
import { WebPreviewLoadingBox, WebPreviewLoadingSpinner } from './WebPreview.styles';

interface WebPreviewData {
  url: string;
  title?: string;
  description?: string;
  imageUrl?: string;
}

interface OgMeta {
  title: string;
  description: string;
  imageUrl?: string;
  favicon?: string;
}

interface WebPreviewWidgetProps {
  json: string;
  isComplete: boolean;
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function getFaviconUrl(url: string): string {
  try {
    const origin = new URL(url).origin;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(origin)}&sz=64`;
  } catch {
    return '';
  }
}

function parseOgFromHtml(html: string): Partial<OgMeta> {
  const get = (property: string): string | undefined => {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']` +
      `|<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
      'i',
    );
    const m = html.match(re);
    return m?.[1] ?? m?.[2] ?? undefined;
  };

  const title = get('og:title') || get('twitter:title');
  const description = get('og:description') || get('twitter:description') || get('description');
  const imageUrl = get('og:image') || get('twitter:image');

  return { title, description, imageUrl };
}

function useOgMeta(url: string | undefined): { meta: OgMeta | null; loading: boolean } {
  const [meta, setMeta] = useState<OgMeta | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!url) return;

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
        const resp = await fetch(proxyUrl, { signal: AbortSignal.timeout(6000) });
        if (!resp.ok || cancelled) return;

        const text = await resp.text();
        if (cancelled) return;

        const parsed = parseOgFromHtml(text);
        const domain = getDomain(url);

        setMeta({
          title: parsed.title || domain,
          description: parsed.description || '',
          imageUrl: parsed.imageUrl,
          favicon: getFaviconUrl(url),
        });
      } catch {
        if (!cancelled) {
          setMeta({
            title: getDomain(url),
            description: '',
            favicon: getFaviconUrl(url),
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [url]);

  return { meta, loading };
}

export const WebPreviewWidget: React.FC<WebPreviewWidgetProps> = React.memo(
  ({ json, isComplete }) => {
    const data = isComplete ? parseWebPreviewJson<WebPreviewData>(json) : null;
    const needsFetch = !!data?.url && !data.title;
    const { meta, loading } = useOgMeta(needsFetch ? data?.url : undefined);

    if (!isComplete || loading) {
      return (
        <WebPreviewLoadingBox>
          <WebPreviewLoadingSpinner />
          Loading preview...
        </WebPreviewLoadingBox>
      );
    }

    if (!data?.url) return null;

    const title = data.title || meta?.title || getDomain(data.url);
    const description = data.description || meta?.description || '';
    const imageUrl = data.imageUrl || meta?.imageUrl;
    const favicon = meta?.favicon || getFaviconUrl(data.url);

    return (
      <WebLinkPreview
        url={data.url}
        title={title}
        description={description}
        imageUrl={imageUrl}
        favicon={favicon}
      />
    );
  },
);

WebPreviewWidget.displayName = 'WebPreviewWidget';
