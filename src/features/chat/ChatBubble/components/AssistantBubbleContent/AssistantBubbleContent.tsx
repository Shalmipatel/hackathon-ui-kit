import React, { Suspense, lazy, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkDefinitionList from 'remark-definition-list';
import { theme } from '@/components/theme';
import { downloadFile } from '@/providers/files';
import { getGateway } from '@/features/app/bootstrap/providers';
import type {
  ActiveToolInfo,
  ExtractedHtmlBlock,
  ExtractedVioBlock,
  ExtractedVioFileRef,
  ExtractedNeoclawBlock,
} from '../../types';
import { ThinkingIndicatorComponent, ToolIndicatorComponent } from '../ToolIndicator';
import {
  HtmlCodeBlock,
  extractHtmlBlocks,
  HTML_PLACEHOLDER_PREFIX,
} from '../Widgets/HtmlPreview';
import {
  VioFileLoader,
  VioErrorBoundary,
  extractVioHotelBlocks,
  extractVioFileRefs,
  parsePartialVioJson,
  VIO_HOTELS_PLACEHOLDER_PREFIX,
  VIO_HOTELS_FILE_REF_PREFIX,
  VioSearchingBox,
  VioSearchingSpinner,
} from '../Widgets/VioHotels';
import {
  QuestionWidget,
  extractQuestionBlocks,
  QUESTION_PLACEHOLDER_PREFIX,
} from '../Widgets/Question';
import {
  ChoicesWidget,
  extractChoicesBlocks,
  CHOICES_PLACEHOLDER_PREFIX,
} from '../Widgets/Choices';
import {
  WebPreviewWidget,
  extractWebPreviewBlocks,
  WEB_PREVIEW_PLACEHOLDER_PREFIX,
} from '../Widgets/WebPreview';
import {
  AudioPlayerWidget,
  extractAudioBlocks,
  AUDIO_PLAYER_PLACEHOLDER_PREFIX,
} from '../Widgets/AudioPlayer';
import {
  VideoPlayerWidget,
  extractVideoBlocks,
  VIDEO_PLAYER_PLACEHOLDER_PREFIX,
} from '../Widgets/VideoPlayer';
import { BrowserPreviewWidget } from '../Widgets/BrowserPreview';
import { MarkdownContent } from './AssistantBubbleContent.styles';

const VioHotelSearchResults = lazy(() => import('@/features/vio/VioHotelSearchResults'));

const remarkPluginsStable = [remarkGfm, remarkDefinitionList] as const;

interface AssistantBubbleContentProps {
  content: string;
  messageId: string;
  isStreaming?: boolean;
  isLastAssistant?: boolean;
  activeTool?: ActiveToolInfo | null;
  isThinking?: boolean;
  thinkingMessage?: string;
}

export const AssistantBubbleContent: React.FC<AssistantBubbleContentProps> = ({
  content,
  messageId,
  isStreaming,
  isLastAssistant,
  activeTool,
  isThinking,
  thinkingMessage,
}) => {
  const showCursor = isStreaming && content.length > 0;

  // Latch: show the browser preview widget once a browser tool call is seen.
  // Once set, it persists for the lifetime of this component instance.
  const [browserSeen, setBrowserSeen] = useState(false);
  const browserSeenRef = useRef(false);

  if (activeTool?.name === 'browser' && !browserSeenRef.current) {
    browserSeenRef.current = true;
    setBrowserSeen(true);
  }

  // VNC stays live while this is the last assistant message.
  // When the user sends a new message, a new assistant bubble takes over
  // and isLastAssistant flips to false — that triggers the ended overlay.
  const browserActive = browserSeen && !!isLastAssistant;

  const {
    markdown: processedContent,
    blocks: currentBlocks,
    vioBlocks: currentVioBlocks,
    vioFileRefs: currentVioFileRefs,
    questionBlocks: currentQuestionBlocks,
    choicesBlocks: currentChoicesBlocks,
    webPreviewBlocks: currentWebPreviewBlocks,
    audioBlocks: currentAudioBlocks,
    videoBlocks: currentVideoBlocks,
  } = React.useMemo(() => {
    const html = extractHtmlBlocks(content, !!isStreaming);
    const vio = extractVioHotelBlocks(html.markdown, !!isStreaming);
    const fileRefs = extractVioFileRefs(vio.markdown);
    const question = extractQuestionBlocks(fileRefs.markdown, !!isStreaming);
    const choices = extractChoicesBlocks(question.markdown, !!isStreaming);
    const webPreview = extractWebPreviewBlocks(choices.markdown, !!isStreaming);
    const audio = extractAudioBlocks(webPreview.markdown, !!isStreaming);
    const video = extractVideoBlocks(audio.markdown, !!isStreaming);
    return {
      markdown: video.markdown,
      blocks: html.blocks,
      vioBlocks: vio.blocks,
      vioFileRefs: fileRefs.refs,
      questionBlocks: question.blocks,
      choicesBlocks: choices.blocks,
      webPreviewBlocks: webPreview.blocks,
      audioBlocks: audio.blocks,
      videoBlocks: video.blocks,
    };
  }, [content, isStreaming]);

  const htmlBlocksRef = useRef<ExtractedHtmlBlock[]>(currentBlocks);
  htmlBlocksRef.current = currentBlocks;
  const vioBlocksRef = useRef<ExtractedVioBlock[]>(currentVioBlocks);
  vioBlocksRef.current = currentVioBlocks;
  const vioFileRefsRef = useRef<ExtractedVioFileRef[]>(currentVioFileRefs);
  vioFileRefsRef.current = currentVioFileRefs;
  const questionBlocksRef = useRef<ExtractedNeoclawBlock[]>(currentQuestionBlocks);
  questionBlocksRef.current = currentQuestionBlocks;
  const choicesBlocksRef = useRef<ExtractedNeoclawBlock[]>(currentChoicesBlocks);
  choicesBlocksRef.current = currentChoicesBlocks;
  const webPreviewBlocksRef = useRef<ExtractedNeoclawBlock[]>(currentWebPreviewBlocks);
  webPreviewBlocksRef.current = currentWebPreviewBlocks;
  const audioBlocksRef = useRef<ExtractedNeoclawBlock[]>(currentAudioBlocks);
  audioBlocksRef.current = currentAudioBlocks;
  const videoBlocksRef = useRef<ExtractedNeoclawBlock[]>(currentVideoBlocks);
  videoBlocksRef.current = currentVideoBlocks;

  const messageIdRef = useRef(messageId);
  messageIdRef.current = messageId;

  const mdComponents = React.useMemo(
    () => ({
      a: ({
        href,
        children,
        ...props
      }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children?: React.ReactNode }) => {
        const isNeoclawFile =
          href?.startsWith('/neoclaw-files/') || href?.startsWith('/api/neoclaw-files/');
        if (isNeoclawFile && href) {
          const handleDownload = async (e: React.MouseEvent) => {
            e.preventDefault();
            try {
              await downloadFile(getGateway(), href);
            } catch (err) {
              console.error('[ChatBubble] Download error:', err);
            }
          };
          return (
            <a href={href} onClick={handleDownload} style={{ cursor: 'pointer' }} {...props}>
              {children}
            </a>
          );
        }
        return (
          <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
            {children}
          </a>
        );
      },
      p: ({
        children,
        ...props
      }: React.HTMLAttributes<HTMLParagraphElement> & { children?: React.ReactNode }) => {
        const childArray = React.Children.toArray(children);
        if (childArray.length === 1 && typeof childArray[0] === 'string') {
          const text = (childArray[0] as string).trim();

          if (text.startsWith(HTML_PLACEHOLDER_PREFIX)) {
            const block = htmlBlocksRef.current.find((b) => b.id === text);
            if (block) {
              return (
                <div className="neoclaw-widget-wrap" key={block.hash}>
                  <HtmlCodeBlock code={block.code} isStreaming={!block.isComplete} />
                </div>
              );
            }
          }

          if (text.startsWith(VIO_HOTELS_FILE_REF_PREFIX)) {
            const ref = vioFileRefsRef.current.find((r) => r.id === text);
            if (ref) {
              return (
                <div className="neoclaw-widget-wrap" key={ref.hash}>
                  <VioFileLoader url={ref.url} />
                </div>
              );
            }
          }

          if (text.startsWith(VIO_HOTELS_PLACEHOLDER_PREFIX)) {
            const block = vioBlocksRef.current.find((b) => b.id === text);
            const stableKey = text.replace(/_.*$/, '');
            if (block) {
              const parsed = parsePartialVioJson(block.json);
              if (!parsed && block.isComplete) {
                console.error(
                  '[VioHotelSearch] Failed to parse JSON. Length:',
                  block.json.length,
                  'First 200 chars:',
                  block.json.slice(0, 200)
                );
              }
              if (parsed) {
                return (
                  <div className="neoclaw-widget-wrap" key={stableKey}>
                    <VioErrorBoundary>
                      <Suspense
                        fallback={
                          <div
                            style={{
                              padding: 16,
                              color: theme.colors.textSecondary,
                              fontSize: 13,
                            }}
                          >
                            Loading hotel results...
                          </div>
                        }
                      >
                        <VioHotelSearchResults data={parsed} isStreaming={!block.isComplete} />
                      </Suspense>
                    </VioErrorBoundary>
                  </div>
                );
              }
            }
            return (
              <div className="neoclaw-widget-wrap" key={stableKey}>
                <VioSearchingBox>
                  <VioSearchingSpinner />
                  Searching for hotels...
                </VioSearchingBox>
              </div>
            );
          }

          if (text.startsWith(QUESTION_PLACEHOLDER_PREFIX)) {
            const block = questionBlocksRef.current.find((b) => b.id === text);
            if (block) {
              return (
                <div className="neoclaw-widget-wrap" key={text.replace(/_.*$/, '')}>
                  <QuestionWidget
                    json={block.json}
                    isComplete={block.isComplete}
                    messageId={messageIdRef.current}
                  />
                </div>
              );
            }
          }

          if (text.startsWith(CHOICES_PLACEHOLDER_PREFIX)) {
            const block = choicesBlocksRef.current.find((b) => b.id === text);
            if (block) {
              return (
                <div className="neoclaw-widget-wrap" key={text.replace(/_.*$/, '')}>
                  <ChoicesWidget
                    json={block.json}
                    isComplete={block.isComplete}
                    messageId={messageIdRef.current}
                  />
                </div>
              );
            }
          }

          if (text.startsWith(WEB_PREVIEW_PLACEHOLDER_PREFIX)) {
            const block = webPreviewBlocksRef.current.find((b) => b.id === text);
            if (block) {
              return (
                <div className="neoclaw-widget-wrap" key={text.replace(/_.*$/, '')}>
                  <WebPreviewWidget
                    json={block.json}
                    isComplete={block.isComplete}
                  />
                </div>
              );
            }
          }

          if (text.startsWith(AUDIO_PLAYER_PLACEHOLDER_PREFIX)) {
            const block = audioBlocksRef.current.find((b) => b.id === text);
            if (block) {
              return (
                <div className="neoclaw-widget-wrap" key={text.replace(/_.*$/, '')}>
                  <AudioPlayerWidget
                    json={block.json}
                    isComplete={block.isComplete}
                  />
                </div>
              );
            }
          }

          if (text.startsWith(VIDEO_PLAYER_PLACEHOLDER_PREFIX)) {
            const block = videoBlocksRef.current.find((b) => b.id === text);
            if (block) {
              return (
                <div className="neoclaw-widget-wrap" key={text.replace(/_.*$/, '')}>
                  <VideoPlayerWidget
                    json={block.json}
                    isComplete={block.isComplete}
                  />
                </div>
              );
            }
          }
        }
        return <p {...props}>{children}</p>;
      },
    }),
    []
  );

  return (
    <>
      {browserSeen && (
        <div className="neoclaw-widget-wrap">
          <BrowserPreviewWidget active={browserActive} isStreaming={!!isStreaming} />
        </div>
      )}

      <MarkdownContent $showCursor={showCursor}>
        <ReactMarkdown remarkPlugins={remarkPluginsStable} components={mdComponents}>
          {processedContent}
        </ReactMarkdown>
      </MarkdownContent>

      {/* Initial thinking indicator when streaming but no content yet */}
      {isStreaming && content.length === 0 && !activeTool && (
        <ThinkingIndicatorComponent message="Thinking..." />
      )}

      {/* Tool indicator */}
      {activeTool && isStreaming && <ToolIndicatorComponent activeTool={activeTool} />}

      {/* Thinking indicator when content is stale */}
      {showCursor && isThinking && !activeTool && (
        <ThinkingIndicatorComponent message={thinkingMessage} />
      )}
    </>
  );
};

export default AssistantBubbleContent;
