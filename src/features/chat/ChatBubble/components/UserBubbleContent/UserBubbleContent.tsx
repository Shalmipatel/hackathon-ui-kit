import React, { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage } from '@/types';
import { formatFileSize } from '../../utils';
import {
  AudioPlayer,
  VoiceLabel,
  AttachmentList,
  AttachmentTag,
  AttachmentTagSize,
  ThumbnailGrid,
  ThumbnailImg,
  LightboxOverlay,
  LightboxImage,
  LightboxClose,
  UserMarkdownContent,
} from './UserBubbleContent.styles';

interface UserBubbleContentProps {
  message: ChatMessage;
}

export const UserBubbleContent: React.FC<UserBubbleContentProps> = ({ message }) => {
  const hasAttachments = message.attachments && message.attachments.length > 0;
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [lightboxClosing, setLightboxClosing] = useState(false);

  const closeLightbox = useCallback(() => {
    setLightboxClosing(true);
    setTimeout(() => {
      setLightboxSrc(null);
      setLightboxClosing(false);
    }, 200);
  }, []);

  return (
    <>
      {message.audioDataUrl ? (
        <>
          <VoiceLabel>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="9" y="1" width="6" height="12" rx="3" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            </svg>
            Voice message
          </VoiceLabel>
          <AudioPlayer controls preload="metadata" src={message.audioDataUrl} />
        </>
      ) : (
        <UserMarkdownContent>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        </UserMarkdownContent>
      )}

      {hasAttachments && (
        <>
          {(() => {
            const images = message.attachments!.filter((a) => a.thumbnailDataUrl);
            const files = message.attachments!.filter((a) => !a.thumbnailDataUrl);
            return (
              <>
                {images.length > 0 && (
                  <ThumbnailGrid>
                    {images.map((att) => (
                      <ThumbnailImg
                        key={att.id}
                        src={att.thumbnailDataUrl}
                        alt={att.filename}
                        title={att.filename}
                        onClick={() =>
                          setLightboxSrc(att.dataUrl || att.thumbnailDataUrl || null)
                        }
                      />
                    ))}
                  </ThumbnailGrid>
                )}
                {files.length > 0 && (
                  <AttachmentList>
                    {files.map((att) => (
                      <AttachmentTag key={att.id}>
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                        {att.filename}
                        <AttachmentTagSize>{formatFileSize(att.size)}</AttachmentTagSize>
                      </AttachmentTag>
                    ))}
                  </AttachmentList>
                )}
              </>
            );
          })()}
        </>
      )}

      {lightboxSrc &&
        createPortal(
          <LightboxOverlay $closing={lightboxClosing} onClick={closeLightbox}>
            <LightboxClose onClick={closeLightbox} aria-label="Close preview">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </LightboxClose>
            <LightboxImage
              src={lightboxSrc}
              alt="Preview"
              onClick={(e) => e.stopPropagation()}
            />
          </LightboxOverlay>,
          document.body
        )}
    </>
  );
};

export default UserBubbleContent;
