import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import styled, { css, keyframes } from 'styled-components';
import { theme } from '@/components/theme';
import { useTranscribe } from '@/features/transcription';
import { useFileUpload } from '@/features/files';
import { hostBridge, permissionsBridge } from '@/providers/host-bridge';
import type { FileAttachment } from '@/types';
import { FILE_INPUT_ACCEPT } from '@/types';

/* ── Animations ── */

const buttonPop = keyframes`
  0% { transform: scale(0.5); opacity: 0; }
  70% { transform: scale(1.08); }
  100% { transform: scale(1); opacity: 1; }
`;

/* ── Helpers ── */

/** Pick the best supported MIME type for audio recording */
function getAudioMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return '';
}

/* ── Styled components ── */

const InputContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  cursor: text;

  @media (max-width: 768px) {
    padding: 8px 16px;
    gap: 4px;
  }
`;

const TextInput = styled.textarea`
  flex: 1;
  padding: 0 8px;
  border: none;
  border-radius: 0;
  font-size: 14px;
  font-weight: 500;
  font-family: ${theme.fontFamily};
  color: ${theme.colors.textPrimary};
  background: transparent;
  outline: none;
  resize: none;
  overflow-y: auto;
  min-height: 20px;
  max-height: 160px;
  line-height: 20px;

  &::placeholder {
    color: ${theme.colors.textMuted};
    font-weight: 500;
  }

  &:disabled {
    color: ${theme.colors.textMuted};
  }

  @media (max-width: 768px) {
    font-size: 16px;
  }
`;

const IconButton = styled.button<{ $variant?: 'primary' | 'muted' | 'danger' }>`
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s ease, opacity 0.15s ease;
  flex-shrink: 0;
  animation: ${buttonPop} 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) both;

  ${(p) =>
    p.$variant === 'muted'
      ? css`
          background-color: transparent;
          color: ${theme.colors.textMuted};
          &:hover:not(:disabled) {
            opacity: 0.7;
          }
        `
      : p.$variant === 'danger'
        ? css`
            background-color: ${theme.colors.textMuted};
            color: #ffffff;
            &:hover:not(:disabled) {
              background-color: ${theme.colors.error};
            }
          `
        : css`
            background-color: #216869;
            color: #242424;
            &:hover:not(:disabled) {
              opacity: 0.85;
            }
          `}

  &:active:not(:disabled) {
    transform: scale(0.85);
  }

  &:disabled {
    background-color: transparent;
    color: ${theme.colors.border};
    cursor: not-allowed;
    animation: none;
  }

  @media (max-width: 768px) {
    width: 32px;
    height: 32px;
  }
`;

const RecordingBar = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 12px;
  min-width: 0;
`;

const WaveformCanvas = styled.canvas`
  flex: 1;
  height: 32px;
  min-width: 0;
`;

const RecordingTimer = styled.span`
  font-size: 13px;
  font-family: ${theme.fontFamily};
  color: ${theme.colors.primary};
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  min-width: 36px;
  text-align: right;
  flex-shrink: 0;
`;

const AudioPreviewPlayer = styled.audio`
  flex: 1;
  height: 36px;
  min-width: 0;

  &::-webkit-media-controls-panel {
    background: ${theme.colors.background};
  }
`;

const InputWrapper = styled.div`
  background: ${theme.colors.surface};
  border-radius: ${theme.borderRadius.lg};
  box-shadow: 0px 0px 16px 0px rgba(157, 157, 157, 0.4);
  position: relative;
  overflow: hidden;
  transition: background 0.15s, max-height 0.3s ease;
`;

const AttachmentPreviewBar = styled.div`
  display: flex;
  gap: 16px;
  padding: 16px 16px 8px;
  overflow-x: scroll;
  overflow-y: hidden;
  flex-wrap: nowrap;

  /* Thin scrollbar — always visible when overflowing */
  &::-webkit-scrollbar {
    height: 4px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(36, 36, 36, 0.1);
    border-radius: 99999px;
  }
  scrollbar-width: thin;
  scrollbar-color: rgba(36, 36, 36, 0.1) transparent;

  @media (max-width: 768px) {
    gap: 8px;
    padding: 12px 12px 8px;
  }
`;

const AttachmentChip = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  padding-right: 13px;
  background: rgba(36, 36, 36, 0.05);
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-family: ${theme.fontFamily};
  color: rgba(36, 36, 36, 0.75);
  max-width: 220px;
  width: 220px;
  overflow: hidden;
  flex-shrink: 0;

  @media (max-width: 480px) {
    width: 180px;
    max-width: 180px;
  }
`;

const ChipThumb = styled.img`
  width: 40px;
  height: 40px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
`;

const ChipName = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  color: rgba(36, 36, 36, 0.75);
  letter-spacing: -0.3px;
`;

const ChipFileIconWrap = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: rgba(36, 36, 36, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: rgba(36, 36, 36, 0.5);
`;

const ChipRemove = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: ${theme.colors.textMuted};
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;

  &:hover {
    background: ${theme.colors.border};
    color: ${theme.colors.textPrimary};
  }
`;

const AttachmentChipWrapper = styled.div`
  position: relative;
  overflow: hidden;
  border-radius: ${theme.borderRadius.sm};
  flex-shrink: 0;
  width: 220px;

  @media (max-width: 480px) {
    width: 180px;
  }
`;

const UploadProgressBar = styled.div<{ $progress: number }>`
  position: absolute;
  bottom: 0;
  left: 0;
  height: 2px;
  width: ${(p) => p.$progress}%;
  background: linear-gradient(90deg, ${theme.colors.primary}, ${theme.colors.primaryHover});
  transition: width 0.15s ease-out;
  z-index: 1;
`;

const UploadingOverlay = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: inherit;
  font-size: 11px;
  color: white;
  font-weight: 600;
  z-index: 2;
`;

const UploadErrorOverlay = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(220, 53, 69, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: inherit;
  font-size: 10px;
  color: white;
  font-weight: 500;
  padding: 2px 4px;
  text-align: center;
  z-index: 2;
`;

/* ── Image Preview Lightbox ── */

const lightboxFadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const lightboxFadeOut = keyframes`
  from { opacity: 1; }
  to { opacity: 0; }
`;

const LightboxOverlay = styled.div<{ $closing?: boolean }>`
  position: fixed;
  inset: 0;
  background: rgba(36, 36, 36, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  cursor: pointer;
  animation: ${(p) => p.$closing ? lightboxFadeOut : lightboxFadeIn} 0.2s ease-out forwards;
`;

const LightboxImage = styled.img`
  max-width: 60vw;
  max-height: 70vh;
  border-radius: 12px;
  object-fit: contain;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  cursor: default;
`;

const LightboxClose = styled.button`
  position: absolute;
  top: 24px;
  right: 24px;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: #242424;
  color: #DCE1DE;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;

  &:hover {
    background: #3a3a3a;
  }
`;

const HiddenFileInput = styled.input`
  display: none;
`;

/* ── Transcribing animation ── */

const equalizerPulse = keyframes`
  0%, 100% { transform: scaleY(0.3); }
  50% { transform: scaleY(1); }
`;

const TranscribingContainer = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 8px;
  min-width: 0;
`;

const EqualizerBars = styled.div`
  display: flex;
  align-items: center;
  gap: 3px;
  height: 20px;
`;

const EqualizerBar = styled.span<{ $delay: string }>`
  width: 3px;
  height: 100%;
  border-radius: 1.5px;
  background-color: ${theme.colors.primary};
  transform-origin: center;
  animation: ${equalizerPulse} 1s ${(p) => p.$delay} ease-in-out infinite;
`;

const TranscribingLabel = styled.span`
  font-size: 14px;
  font-weight: 500;
  font-family: ${theme.fontFamily};
  color: ${theme.colors.textSecondary};
`;

/* ── Helpers ── */

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ── SVG icons ── */

const MicIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="1" width="6" height="12" rx="3" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

const SendIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="19" x2="12" y2="5" />
    <polyline points="5 12 12 5 19 12" />
  </svg>
);

const CloseIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const CheckIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const TrashIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);

const PlusIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const SmallCloseIcon: React.FC = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const FileDocIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);

/* ── Component ── */

const StopIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <rect x="3" y="3" width="18" height="18" rx="3" />
  </svg>
);

const GradientStopButton = styled.button`
  width: 36px;
  height: 36px;
  border: 2px solid #242424;
  border-radius: 50%;
  background: white;
  color: #242424;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: transform 0.15s ease, opacity 0.15s ease;
  animation: ${buttonPop} 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) both;

  &:hover {
    opacity: 0.8;
  }

  &:active {
    transform: scale(0.85);
  }
`;

interface ChatInputProps {
  sessionId: string | null;
  onSend: (text: string, audioDataUrl?: string, attachments?: FileAttachment[], pendingFiles?: File[]) => void;
  onAbort?: () => void;
  onError?: (message: string) => void;
  disabled: boolean;
  /** Files dropped from parent component (e.g., chat area drag/drop) */
  externalFiles?: File[];
  /** Called when externalFiles have been processed */
  onExternalFilesProcessed?: () => void;
}

interface PendingAudio {
  objectUrl: string;
  blob: Blob;
  mimeType: string;
}

const ChatInput: React.FC<ChatInputProps> = ({ sessionId, onSend, onAbort, onError, disabled, externalFiles, onExternalFilesProcessed }) => {
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [pendingAudio, setPendingAudio] = useState<PendingAudio | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [lightboxClosing, setLightboxClosing] = useState(false);

  const closeLightbox = useCallback(() => {
    setLightboxClosing(true);
    setTimeout(() => {
      setLightboxSrc(null);
      setLightboxClosing(false);
    }, 200);
  }, []);

  const { transcribe, isTranscribing, error: transcriptionError, clearError } = useTranscribe();
  const {
    pendingAttachments,
    isUploading,
    uploadFiles,
    uploadPending,
    getPendingFiles,
    cancelUpload,
    removeAttachment,
    clearAttachments,
  } = useFileUpload();

  // Handle files dropped from parent component (e.g., chat area)
  useEffect(() => {
    if (externalFiles && externalFiles.length > 0) {
      uploadFiles(externalFiles, sessionId);
      onExternalFilesProcessed?.();
    }
  }, [externalFiles, sessionId, uploadFiles, onExternalFilesProcessed]);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopModeRef = useRef<'preview' | 'transcribe'>('preview');

  // Waveform refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const waveformHistoryRef = useRef<number[]>([]);

  useEffect(() => {
    if (!disabled && !isTranscribing) {
      inputRef.current?.focus();
    }
  }, [disabled, isTranscribing, sessionId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMediaTracks();
      clearTimer();
      stopWaveform();
      if (pendingAudio) URL.revokeObjectURL(pendingAudio.objectUrl);
    };
  }, []);

  useEffect(() => {
    if (!transcriptionError) return;
    const errorMessages: Record<string, string> = {
      NETWORK_ERROR: 'Network error. Check your connection.',
      AUTH_ERROR: 'Authentication failed. Sign in again.',
      INVALID_AUDIO: 'Audio format not supported.',
      TIMEOUT: 'Transcription timed out. Try again.',
      SERVER_ERROR: 'Transcription failed. Please try again.',
      UNKNOWN: 'Transcription failed. Please try again.',
    };
    onError?.(errorMessages[transcriptionError.code] ?? errorMessages.UNKNOWN);
    clearError();
  }, [transcriptionError]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopMediaTracks = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const stopWaveform = () => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
  };

  const WAVEFORM_BARS = 80;

  const drawWaveform = useCallback(() => {
    const analyser = analyserRef.current;
    const canvas = canvasRef.current;
    if (!analyser || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(dataArray);

      // Compute RMS amplitude for this frame
      let sumSquares = 0;
      for (let i = 0; i < bufferLength; i++) {
        const normalized = (dataArray[i] - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / bufferLength);
      const amplitude = Math.min(1, rms * 4); // amplify for visibility

      // Push to scrolling history (newest on right)
      const history = waveformHistoryRef.current;
      history.push(amplitude);
      if (history.length > WAVEFORM_BARS) {
        history.shift();
      }

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const gap = 2;
      const barWidth = Math.max(2, (w - (WAVEFORM_BARS - 1) * gap) / WAVEFORM_BARS);
      const totalBarWidth = barWidth + gap;

      // Draw from left (oldest) to right (newest)
      const startX = w - history.length * totalBarWidth;

      for (let i = 0; i < history.length; i++) {
        const barHeight = Math.max(2, history[i] * h * 0.85);
        const x = startX + i * totalBarWidth;
        const y = (h - barHeight) / 2;

        // Fade in: older bars are more transparent
        const progress = i / (history.length - 1 || 1);
        const alpha = 0.25 + 0.75 * progress;
        ctx.fillStyle = `rgba(108, 92, 231, ${alpha})`;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 1);
        ctx.fill();
      }
    };

    draw();
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const completedAttachments = pendingAttachments.filter((a) => a.uploadStatus === 'completed');
    const hasPending = pendingAttachments.some((a) => a.uploadStatus === 'pending');
    const rawFiles = hasPending ? getPendingFiles() : undefined;
    onSend(trimmed, undefined, completedAttachments.length > 0 ? completedAttachments : undefined, rawFiles);

    setText('');
    clearAttachments();
    if (inputRef.current) inputRef.current.style.height = 'auto';
  }, [text, onSend, pendingAttachments, clearAttachments, getPendingFiles]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  /** Process a list of File objects (shared by file picker, paste, and drag-drop) */
  const processFiles = useCallback(
    (files: File[]) => {
      if (!sessionId) {
        onError?.('Please select or create a session before uploading files');
        return;
      }
      uploadFiles(Array.from(files), sessionId);
    },
    [uploadFiles, sessionId, onError],
  );

  /** Handle paste events — extract files from clipboard */
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      processFiles(files);
    }
    // If no files, let the default paste (text) happen
  }, [processFiles]);

  /** Handle drag over — show drop zone */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    // Don't stopPropagation - let parent ChatArea also show its drop overlay
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    // Don't stopPropagation - let parent handle drag leave too
    setIsDragOver(false);
  }, []);

  /** Handle drop — extract files */
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files: File[] = [];
    if (e.dataTransfer.files) {
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        files.push(e.dataTransfer.files[i]);
      }
    }
    if (files.length > 0) {
      processFiles(files);
    }
    // Notify parent to clear any drag overlay (in case drop happened on input while parent was showing overlay)
    onExternalFilesProcessed?.();
  }, [processFiles, onExternalFilesProcessed]);

  const handleFilesSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const files: File[] = [];
    for (let i = 0; i < fileList.length; i++) files.push(fileList[i]);
    processFiles(files);
    e.target.value = '';
  }, [processFiles]);

  const startRecording = useCallback(async () => {
    // On native hosts, pre-flight the mic permission via the bridge so we
    // control the denied flow (open Settings) instead of getting a generic
    // web DOMException with no recourse.
    if (hostBridge.isNative()) {
      const status = await permissionsBridge.getStatus('microphone');
      if (status === 'denied') {
        const goToSettings = window.confirm(
          'Microphone access is turned off. To record voice messages, please enable it in your device settings.\n\nOpen Settings?',
        );
        if (goToSettings) permissionsBridge.openSettings();
        return;
      }
      if (status === 'undetermined') {
        const result = await permissionsBridge.request('microphone');
        if (result !== 'granted') {
          onError?.('Microphone permission is required to record voice messages.');
          return;
        }
      }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mimeType = getAudioMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      stopModeRef.current = 'preview';
      waveformHistoryRef.current = [];

      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        clearTimer();
        stopMediaTracks();
        stopWaveform();
        setIsRecording(false);
        setRecordingSeconds(0);

        const chunks = audioChunksRef.current;
        if (chunks.length === 0) return;

        const resolvedMimeType = recorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(chunks, { type: resolvedMimeType });

        if (stopModeRef.current === 'preview') {
          // Show audio preview for replay
          const objectUrl = URL.createObjectURL(audioBlob);
          setPendingAudio({ objectUrl, blob: audioBlob, mimeType: resolvedMimeType });
        } else {
          // Transcribe immediately
          doTranscribe(audioBlob, resolvedMimeType);
        }
      };

      recorder.onerror = () => {
        console.warn('[NeoClaw] MediaRecorder error');
        clearTimer();
        stopMediaTracks();
        stopWaveform();
        setIsRecording(false);
        setRecordingSeconds(0);
      };

      recorder.start(1000);
      setIsRecording(true);
      setRecordingSeconds(0);

      timerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      if (hostBridge.isNative()) {
        onError?.('Could not access microphone. Please check permissions in Settings.');
        return;
      }
      const msg =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Microphone permission denied. Please check your browser settings.'
          : err instanceof DOMException && err.name === 'NotFoundError'
            ? 'No microphone detected.'
            : 'Could not access microphone.';
      onError?.(msg);
    }
  }, [onError]);

  // Start drawing waveform when canvas mounts during recording
  const waveformCanvasRef = useCallback(
    (node: HTMLCanvasElement | null) => {
      canvasRef.current = node;
      if (node && analyserRef.current) {
        const rect = node.getBoundingClientRect();
        node.width = rect.width;
        node.height = rect.height;
        drawWaveform();
      }
    },
    [drawWaveform],
  );

  /** Shared transcription logic */
  const doTranscribe = useCallback(async (blob: Blob, mimeType: string) => {
    const transcribedText = await transcribe(blob, mimeType);
    if (transcribedText) {
      setText((prev) => {
        const separator = prev.trim() ? ' ' : '';
        return prev + separator + transcribedText;
      });
    }
  }, [transcribe]);

  const stopRecorder = useCallback(() => {
    // Release the mic immediately so the browser indicator turns off right away.
    // The recorder.onstop callback will still fire and process the audio chunks.
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    clearTimer();
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  /** ✓ during recording → stop & transcribe immediately */
  const confirmRecording = useCallback(() => {
    stopModeRef.current = 'transcribe';
    stopRecorder();
  }, [stopRecorder]);

  /** ✕ during recording → stop & show preview */
  const previewRecording = useCallback(() => {
    stopModeRef.current = 'preview';
    stopRecorder();
  }, [stopRecorder]);

  /** Discard the previewed audio */
  const discardPreview = useCallback(() => {
    if (pendingAudio) {
      URL.revokeObjectURL(pendingAudio.objectUrl);
      setPendingAudio(null);
    }
  }, [pendingAudio]);

  /** Transcribe the previewed audio */
  const confirmPreview = useCallback(() => {
    if (!pendingAudio) return;
    const { blob, mimeType, objectUrl } = pendingAudio;
    URL.revokeObjectURL(objectUrl);
    setPendingAudio(null);
    doTranscribe(blob, mimeType);
  }, [pendingAudio, doTranscribe]);

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const hasCompletedAttachments = pendingAttachments.some((a) => a.uploadStatus === 'completed');
  const canSend = text.trim().length > 0 && !isUploading;
  const inputDisabled = disabled || isTranscribing || isUploading;
  const hasAttachments = pendingAttachments.length > 0;

  const getPlaceholder = (): string => {
    if (isTranscribing) return 'Transcribing...';
    if (disabled) return 'Waiting for response...';
    if (hasAttachments) {
      return pendingAttachments.length === 1
        ? 'What would you like to do with this file?'
        : 'What would you like to do with these files?';
    }
    return 'Message';
  };

  // ── Recording state ──
  if (isRecording) {
    return (
      <InputWrapper>
        <InputContainer>
          <IconButton $variant="muted" onClick={previewRecording} aria-label="Stop and preview">
            <CloseIcon />
          </IconButton>
          <RecordingBar>
            <WaveformCanvas ref={waveformCanvasRef} />
            <RecordingTimer>{formatTime(recordingSeconds)}</RecordingTimer>
          </RecordingBar>
          <IconButton onClick={confirmRecording} aria-label="Stop and transcribe">
            <CheckIcon />
          </IconButton>
        </InputContainer>
      </InputWrapper>
    );
  }

  // ── Audio preview state (replay before transcribing) ──
  if (pendingAudio) {
    return (
      <InputWrapper>
        <InputContainer>
          <IconButton $variant="muted" onClick={discardPreview} aria-label="Discard recording">
            <TrashIcon />
          </IconButton>
          <AudioPreviewPlayer controls preload="metadata" src={pendingAudio.objectUrl} />
          <IconButton onClick={confirmPreview} aria-label="Transcribe recording">
            <CheckIcon />
          </IconButton>
        </InputContainer>
      </InputWrapper>
    );
  }

  // ── Transcribing state ──
  if (isTranscribing) {
    return (
      <InputWrapper>
        <InputContainer>
          <TranscribingContainer>
            <EqualizerBars aria-hidden="true">
              <EqualizerBar $delay="0s" />
              <EqualizerBar $delay="0.15s" />
              <EqualizerBar $delay="0.3s" />
              <EqualizerBar $delay="0.45s" />
              <EqualizerBar $delay="0.6s" />
            </EqualizerBars>
            <TranscribingLabel aria-live="polite">Transcribing</TranscribingLabel>
          </TranscribingContainer>
        </InputContainer>
      </InputWrapper>
    );
  }

  // ── Default state (text input + optional attachments) ──
  return (
    <>
    <InputWrapper
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {hasAttachments && (
        <AttachmentPreviewBar>
          {pendingAttachments.map((att) => (
            <AttachmentChipWrapper key={att.id}>
              <AttachmentChip>
                {att.category === 'image' && att.thumbnailDataUrl ? (
                  <ChipThumb
                    src={att.thumbnailDataUrl}
                    alt={att.filename}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => { e.stopPropagation(); setLightboxSrc(att.dataUrl || att.thumbnailDataUrl || null); }}
                  />
                ) : att.category === 'image' && att.dataUrl ? (
                  <ChipThumb
                    src={att.dataUrl}
                    alt={att.filename}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => { e.stopPropagation(); setLightboxSrc(att.dataUrl || null); }}
                  />
                ) : (
                  <ChipFileIconWrap><FileDocIcon /></ChipFileIconWrap>
                )}
                <ChipName title={att.filename}>{att.filename}</ChipName>
                <ChipRemove
                  onClick={() =>
                    att.uploadStatus === 'uploading'
                      ? cancelUpload(att.id)
                      : removeAttachment(att.id)
                  }
                  aria-label={`Remove ${att.filename}`}
                >
                  <SmallCloseIcon />
                </ChipRemove>
              </AttachmentChip>
              {att.uploadStatus === 'uploading' && (
                <>
                  <UploadProgressBar $progress={att.uploadProgress ?? 0} />
                  <UploadingOverlay>{att.uploadProgress ?? 0}%</UploadingOverlay>
                </>
              )}
              {att.uploadStatus === 'failed' && (
                <UploadErrorOverlay title={att.uploadError}>Failed</UploadErrorOverlay>
              )}
            </AttachmentChipWrapper>
          ))}
        </AttachmentPreviewBar>
      )}
      <InputContainer onClick={(e) => { if (e.target === e.currentTarget) inputRef.current?.focus(); }}>
        <IconButton
          onClick={openFilePicker}
          disabled={inputDisabled}
          $variant="muted"
          aria-label="Attach file"
        >
          <PlusIcon />
        </IconButton>
        <HiddenFileInput
          ref={fileInputRef}
          type="file"
          multiple
          accept={FILE_INPUT_ACCEPT}
          onChange={handleFilesSelected}
        />
        <TextInput
          ref={inputRef}
          rows={1}
          placeholder={getPlaceholder()}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          disabled={inputDisabled}
          aria-label="Chat message input"
        />
        {disabled && onAbort ? (
          <GradientStopButton
            key="stop"
            onClick={onAbort}
            aria-label="Stop generating"
          >
            <StopIcon />
          </GradientStopButton>
        ) : canSend ? (
          <IconButton
            key="send"
            onClick={handleSend}
            disabled={inputDisabled}
            aria-label="Send message"
          >
            <SendIcon />
          </IconButton>
        ) : (
          <IconButton
            key="mic"
            onClick={startRecording}
            disabled={inputDisabled}
            $variant="muted"
            aria-label="Start voice input"
          >
            <MicIcon />
          </IconButton>
        )}
      </InputContainer>
    </InputWrapper>

    {lightboxSrc && createPortal(
      <LightboxOverlay $closing={lightboxClosing} onClick={closeLightbox}>
        <LightboxClose onClick={closeLightbox} aria-label="Close preview">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </LightboxClose>
        <LightboxImage src={lightboxSrc} alt="Preview" onClick={(e) => e.stopPropagation()} />
      </LightboxOverlay>,
      document.body,
    )}
    </>
  );
};

export default ChatInput;
