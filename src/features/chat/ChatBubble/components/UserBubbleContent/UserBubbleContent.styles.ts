import styled, { keyframes } from 'styled-components';
import { theme } from '@/components/theme';
import { BaseMarkdownContent } from '../../ChatBubble.markdown.styles';

/* ── Image Preview Lightbox ── */

const lbFadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const lbFadeOut = keyframes`
  from { opacity: 1; }
  to { opacity: 0; }
`;

export const LightboxOverlay = styled.div<{ $closing?: boolean }>`
  position: fixed;
  inset: 0;
  background: rgba(36, 36, 36, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  cursor: pointer;
  animation: ${(p) => (p.$closing ? lbFadeOut : lbFadeIn)} 0.2s ease-out forwards;
`;

export const LightboxImage = styled.img`
  max-width: 60vw;
  max-height: 70vh;
  border-radius: 12px;
  object-fit: contain;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  cursor: default;
`;

export const LightboxClose = styled.button`
  position: absolute;
  top: 24px;
  right: 24px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;

  &:hover {
    background: rgba(255, 255, 255, 0.25);
  }
`;

export const AudioPlayer = styled.audio`
  display: block;
  width: 100%;
  max-width: 280px;
  height: 36px;
  margin-top: 6px;
  border-radius: ${theme.borderRadius.sm};

  &::-webkit-media-controls-panel {
    background: rgba(255, 255, 255, 0.15);
  }
`;

export const VoiceLabel = styled.span`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  opacity: 0.85;
`;

export const AttachmentList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
`;

export const AttachmentTag = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.15);
  font-size: 12px;
  opacity: 0.9;
`;

export const AttachmentTagSize = styled.span`
  opacity: 0.7;
`;

export const ThumbnailGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
`;

export const ThumbnailImg = styled.img`
  max-width: 120px;
  max-height: 120px;
  border-radius: 8px;
  object-fit: cover;
  display: block;
  cursor: pointer;
  transition: opacity 0.15s;

  &:hover {
    opacity: 0.85;
  }
`;

export const UserMarkdownContent = styled(BaseMarkdownContent)``;
