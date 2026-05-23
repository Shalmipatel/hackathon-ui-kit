import { getCodeHash } from '../../../utils';
import type { ExtractedHtmlBlock } from '../../../types';

export const HTML_PREVIEW_LANGUAGE_TAG = 'html';
export const HTML_PREVIEW_SHOW_CODE_TAB = false;
export const HTML_PLACEHOLDER_PREFIX = 'HTMLPREVIEW';

export function extractHtmlBlocks(
  content: string,
  isStreaming: boolean
): { markdown: string; blocks: ExtractedHtmlBlock[] } {
  const blocks: ExtractedHtmlBlock[] = [];
  const openTag = '```' + HTML_PREVIEW_LANGUAGE_TAG;
  const closeTag = '```';

  let markdown = content;
  let searchStart = 0;
  let blockIndex = 0;

  while (true) {
    const openPos = markdown.indexOf(openTag, searchStart);
    if (openPos === -1) break;

    const codeStart = openPos + openTag.length + 1;
    const closePos = markdown.indexOf('\n' + closeTag, codeStart);

    let code: string;
    let isComplete: boolean;
    let blockEnd: number;

    if (closePos === -1) {
      code = markdown.slice(codeStart).replace(/\n$/, '');
      isComplete = !isStreaming;
      blockEnd = markdown.length;
    } else {
      code = markdown.slice(codeStart, closePos).replace(/\n$/, '');
      isComplete = true;
      blockEnd = closePos + closeTag.length + 1;
    }

    const hash = getCodeHash(code);
    const id = `${HTML_PLACEHOLDER_PREFIX}${blockIndex}_${hash}`;

    blocks.push({ id, code, isComplete, hash });

    const before = markdown.slice(0, openPos);
    const after = markdown.slice(blockEnd);
    markdown = before + `\n\n${id}\n\n` + after;

    searchStart = before.length + id.length + 4;
    blockIndex++;
  }

  return { markdown, blocks };
}

export function generateSrcdoc(code: string, iframeId: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <base target="_blank">
  <style>
    html, body { margin: 0; padding: 0; height: auto !important; min-height: 0 !important; }
    #__wrapper { padding: 12px; font-family: system-ui, -apple-system, sans-serif; }
  </style>
</head>
<body>
  <div id="__wrapper">${code}</div>
  <script>
    (function() {
      const wrapper = document.getElementById('__wrapper');
      const MAX_HEIGHT = 800;
      const IFRAME_ID = '${iframeId}';
      let lastHeight = 0;
      let timeout;
      function sendHeight() {
        clearTimeout(timeout);
        timeout = setTimeout(function() {
          const rect = wrapper.getBoundingClientRect();
          const height = Math.min(Math.ceil(rect.height), MAX_HEIGHT);
          if (height !== lastHeight) {
            lastHeight = height;
            window.parent.postMessage({ type: 'resize', height: height, iframeId: IFRAME_ID }, '*');
          }
        }, 50);
      }
      sendHeight();
      window.addEventListener('load', sendHeight);
      new ResizeObserver(sendHeight).observe(wrapper);
    })();
  </script>
</body>
</html>`;
}

export const heightCache = new Map<string, number>();
