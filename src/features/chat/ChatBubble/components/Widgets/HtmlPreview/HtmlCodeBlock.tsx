import React, { useState, useEffect, useRef } from 'react';
import { getCodeHash } from '../../../utils';
import { generateSrcdoc, heightCache, HTML_PREVIEW_SHOW_CODE_TAB } from './htmlUtils';
import {
  CodeBlockWrapper,
  CodeBlockTabs,
  CodeBlockTab,
  CodeBlockContent,
  PreviewIframe,
  PreviewLoading,
  LoadingSpinner,
} from './HtmlPreview.styles';

interface HtmlCodeBlockProps {
  code: string;
  isStreaming?: boolean;
}

export const HtmlCodeBlock: React.FC<HtmlCodeBlockProps> = React.memo(({ code, isStreaming }) => {
  const codeHash = getCodeHash(code);
  const [activeTab, setActiveTab] = useState<'code' | 'preview'>('preview');
  const [iframeHeight, setIframeHeight] = useState(() => heightCache.get(codeHash) || 100);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const iframeIdRef = useRef(`iframe-${codeHash}-${Date.now()}`);

  const showTabs = HTML_PREVIEW_SHOW_CODE_TAB;

  useEffect(() => {
    const iframeId = iframeIdRef.current;
    const handleMessage = (event: MessageEvent) => {
      if (
        event.data?.type === 'resize' &&
        event.data?.iframeId === iframeId &&
        typeof event.data.height === 'number'
      ) {
        const newHeight = Math.max(60, event.data.height);
        setIframeHeight(newHeight);
        heightCache.set(codeHash, newHeight);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [codeHash]);

  const srcdoc = React.useMemo(() => {
    const iframeId = iframeIdRef.current;
    return generateSrcdoc(code, iframeId);
  }, [code]);

  if (isStreaming) {
    return (
      <CodeBlockWrapper $hasTabs={showTabs} data-html-preview>
        <PreviewLoading>
          <LoadingSpinner />
          Rendering preview...
        </PreviewLoading>
      </CodeBlockWrapper>
    );
  }

  return (
    <CodeBlockWrapper $hasTabs={showTabs} data-html-preview>
      {showTabs && (
        <CodeBlockTabs>
          <CodeBlockTab $active={activeTab === 'preview'} onClick={() => setActiveTab('preview')}>
            Preview
          </CodeBlockTab>
          <CodeBlockTab $active={activeTab === 'code'} onClick={() => setActiveTab('code')}>
            Code
          </CodeBlockTab>
        </CodeBlockTabs>
      )}
      {showTabs && activeTab === 'code' ? (
        <CodeBlockContent>
          <code>{code}</code>
        </CodeBlockContent>
      ) : (
        <PreviewIframe
          ref={iframeRef}
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
          srcDoc={srcdoc}
          style={{ height: iframeHeight }}
        />
      )}
    </CodeBlockWrapper>
  );
});

HtmlCodeBlock.displayName = 'HtmlCodeBlock';

export default HtmlCodeBlock;
