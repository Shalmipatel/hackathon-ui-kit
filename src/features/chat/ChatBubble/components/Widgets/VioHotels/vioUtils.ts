import { getCodeHash } from '../../../utils';
import type { ExtractedVioBlock, ExtractedVioFileRef } from '../../../types';
import type { VioSearchResponse, Hotel } from '@/features/vio/vio-types';

export const VIO_HOTELS_LANGUAGE_TAG = 'vio-hotels';
export const VIO_HOTELS_PLACEHOLDER_PREFIX = 'VIOHOTELS';
export const VIO_HOTELS_FILE_REF_PREFIX = 'VIOHOTELSFILE';
export const VIO_HOTELS_FILE_PATTERN = /\[VIO_HOTELS:\s*([^\]]+)\]/g;

export function extractVioHotelBlocks(
  content: string,
  isStreaming: boolean
): { markdown: string; blocks: ExtractedVioBlock[] } {
  const blocks: ExtractedVioBlock[] = [];
  const openTag = '```' + VIO_HOTELS_LANGUAGE_TAG;
  const closeTag = '```';

  let markdown = content;
  let searchStart = 0;
  let blockIndex = 0;

  while (true) {
    const openPos = markdown.indexOf(openTag, searchStart);
    if (openPos === -1) break;

    const codeStart = openPos + openTag.length + 1;
    const closePos = markdown.indexOf('\n' + closeTag, codeStart);

    let json: string;
    let isComplete: boolean;
    let blockEnd: number;

    if (closePos === -1) {
      json = markdown.slice(codeStart).replace(/\n$/, '');
      isComplete = !isStreaming;
      blockEnd = markdown.length;
    } else {
      json = markdown.slice(codeStart, closePos).replace(/\n$/, '');
      isComplete = true;
      blockEnd = closePos + closeTag.length + 1;
    }

    const hash = getCodeHash(json);
    const id = `${VIO_HOTELS_PLACEHOLDER_PREFIX}${blockIndex}_${hash}`;

    blocks.push({ id, json, isComplete, hash });

    const before = markdown.slice(0, openPos);
    const after = markdown.slice(blockEnd);
    markdown = before + `\n\n${id}\n\n` + after;

    searchStart = before.length + id.length + 4;
    blockIndex++;
  }

  return { markdown, blocks };
}

export function extractVioFileRefs(
  content: string
): { markdown: string; refs: ExtractedVioFileRef[] } {
  const refs: ExtractedVioFileRef[] = [];
  let markdown = content;
  let refIndex = 0;

  markdown = markdown.replace(VIO_HOTELS_FILE_PATTERN, (match, url) => {
    const trimmedUrl = url.trim();
    const hash = getCodeHash(trimmedUrl);
    const id = `${VIO_HOTELS_FILE_REF_PREFIX}${refIndex}_${hash}`;
    refs.push({ id, url: trimmedUrl, hash });
    refIndex++;
    return `\n\n${id}\n\n`;
  });

  return { markdown, refs };
}

export function parsePartialVioJson(json: string): VioSearchResponse | null {
  try {
    return JSON.parse(json) as VioSearchResponse;
  } catch {
    // Fall through to incremental extraction
  }

  const hotelsMarker = '"hotels":[';
  const hotelsIdx = json.indexOf(hotelsMarker);
  if (hotelsIdx === -1) return null;

  const arrayStart = hotelsIdx + hotelsMarker.length;

  const hotels: Hotel[] = [];
  let i = arrayStart;
  let depth = 0;
  let objStart = -1;
  let inString = false;
  let escaped = false;

  while (i < json.length) {
    const ch = json[i];

    if (escaped) {
      escaped = false;
      i++;
      continue;
    }
    if (ch === '\\' && inString) {
      escaped = true;
      i++;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      i++;
      continue;
    }
    if (inString) {
      i++;
      continue;
    }

    if (ch === '{') {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && objStart !== -1) {
        try {
          hotels.push(JSON.parse(json.slice(objStart, i + 1)));
        } catch {
          /* incomplete object — skip */
        }
        objStart = -1;
      }
    }
    i++;
  }

  if (hotels.length === 0) return null;

  let meta: Partial<VioSearchResponse> = {};
  try {
    meta = JSON.parse(json.slice(0, hotelsIdx) + '"hotels":[]}');
  } catch {
    /* metadata not parsable yet */
  }

  return { ...meta, hotels } as VioSearchResponse;
}
