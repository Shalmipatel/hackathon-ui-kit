import { getCodeHash } from '../../../utils';
import type { ExtractedNeoclawBlock } from '../../../types';

export const AUDIO_PLAYER_LANGUAGE_TAG = 'neoclaw-audio';
export const AUDIO_PLAYER_PLACEHOLDER_PREFIX = 'NEOCLAWAUDIO';

export function extractAudioBlocks(
  content: string,
  isStreaming: boolean,
): { markdown: string; blocks: ExtractedNeoclawBlock[] } {
  const blocks: ExtractedNeoclawBlock[] = [];
  const openTag = '```' + AUDIO_PLAYER_LANGUAGE_TAG;
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
    const id = `${AUDIO_PLAYER_PLACEHOLDER_PREFIX}${blockIndex}_${hash}`;

    blocks.push({ id, json, isComplete, hash });

    const before = markdown.slice(0, openPos);
    const after = markdown.slice(blockEnd);
    markdown = before + `\n\n${id}\n\n` + after;

    searchStart = before.length + id.length + 4;
    blockIndex++;
  }

  return { markdown, blocks };
}

export function parseAudioJson<T>(json: string): T | null {
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}
