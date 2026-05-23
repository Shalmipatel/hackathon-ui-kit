/**
 * SessionFilesPanel Component
 * Dropdown panel showing files for the current session.
 */

import React, { forwardRef, useState, useRef, useEffect, useCallback, useImperativeHandle } from 'react';
import styled from 'styled-components';
import { theme } from '@/components/theme';
import { BottomSheet } from '@/components/BottomSheet';
import { useIsMobile } from '@/components/useIsMobile';
import { useSessionFiles } from './useSessionFiles';
import { downloadFile, type SessionFile } from '@/providers/files';
import { getGateway } from '@/features/app/bootstrap/providers';

const Container = styled.div`
  position: relative;
`;

const TriggerButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px;
  padding-right: 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #242424;
  font-size: 15px;
  font-weight: 500;
  font-family: 'Inter', ${theme.fontFamily};
  letter-spacing: -0.3px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: rgba(36, 36, 36, 0.05);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Mobile: collapse to just the folder icon + count badge — no label,
     no hover bg, just enough padding to keep a 36px tap target. */
  @media (max-width: 768px) {
    gap: 4px;
    padding: 6px;
    -webkit-tap-highlight-color: transparent;

    &:hover {
      background: transparent;
    }
  }
`;

const TriggerLabel = styled.span`
  @media (max-width: 768px) {
    display: none;
  }
`;

const badgePop = `
  @keyframes badgePop {
    0% { transform: scale(1); }
    50% { transform: scale(1.3); }
    100% { transform: scale(1); }
  }
`;

const Badge = styled.span<{ $animate?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: 'Red Hat Display', sans-serif;
  font-size: 14px;
  font-weight: 500;
  color: rgba(36, 36, 36, 0.75);
  line-height: 21px;
  ${badgePop}
  ${(p) => p.$animate && `animation: badgePop 0.3s ease-out;`}
`;

const TriggerStatus = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
`;

const TriggerLoader = styled.span`
  width: 12px;
  height: 12px;
  border: 2px solid ${theme.colors.border};
  border-top-color: ${theme.colors.primary};
  border-radius: 50%;
  animation: triggerSpin 0.8s linear infinite;

  @keyframes triggerSpin {
    to { transform: rotate(360deg); }
  }
`;

const Dropdown = styled.div`
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  width: 320px;
  background: ${theme.colors.surface};
  border: 1px solid ${theme.colors.border};
  border-radius: ${theme.borderRadius.lg};
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 100;
  display: flex;
  flex-direction: column;
  max-height: 360px;
`;

const DropdownHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid ${theme.colors.border};
  font-size: 13px;
  font-weight: 600;
  font-family: ${theme.fontFamily};
  color: ${theme.colors.textPrimary};
  flex-shrink: 0;
`;

const RefreshButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: ${theme.borderRadius.sm};
  background: transparent;
  color: ${theme.colors.textMuted};
  cursor: pointer;

  &:hover {
    background: rgba(36, 36, 36, 0.05);
    color: ${theme.colors.textPrimary};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const TabBar = styled.div`
  display: flex;
  border-bottom: 1px solid ${theme.colors.border};
  flex-shrink: 0;
`;

const Tab = styled.button<{ $active?: boolean }>`
  flex: 1;
  padding: 10px 14px;
  border: none;
  background: transparent;
  font-size: 12px;
  font-weight: 500;
  font-family: ${theme.fontFamily};
  color: ${(p) => (p.$active ? '#242424' : theme.colors.textMuted)};
  cursor: pointer;
  position: relative;
  transition: color 0.15s;

  &:hover {
    color: ${(p) => (p.$active ? '#242424' : theme.colors.textPrimary)};
  }

  &::after {
    content: '';
    position: absolute;
    bottom: -1px;
    left: 14px;
    right: 14px;
    height: 2px;
    background: ${(p) => (p.$active ? '#242424' : 'transparent')};
    border-radius: 1px 1px 0 0;
  }
`;

const TabCount = styled.span<{ $active?: boolean }>`
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 600;
  background: ${(p) => (p.$active ? '#242424' : theme.colors.border)};
  color: ${(p) => (p.$active ? 'white' : theme.colors.textMuted)};
`;

const FileList = styled.div`
  flex: 1;
  overflow-y: auto;
  min-height: 0;
`;

const FileRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  cursor: pointer;
  transition: background 0.1s;
  border-bottom: 1px solid ${theme.colors.border};

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: rgba(36, 36, 36, 0.05);
  }

  &:active {
    background: rgba(36, 36, 36, 0.08);
  }
`;

const FileIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: ${theme.borderRadius.sm};
  background: rgba(36, 36, 36, 0.05);
  color: ${theme.colors.textMuted};
  flex-shrink: 0;
  overflow: hidden;
`;

const FileThumbImg = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: ${theme.borderRadius.sm};
`;

/** Fetches an image via the authenticated gateway and renders a thumbnail */
const AuthedThumb: React.FC<{ downloadUrl: string; alt: string }> = ({ downloadUrl, alt }) => {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | undefined;
    let cancelled = false;

    (async () => {
      try {
        const gateway = getGateway();
        const prepared = await gateway.prepareRequest(downloadUrl, { method: 'GET' });
        const resp = await fetch(prepared.url, prepared.init);
        if (!resp.ok || cancelled) return;
        const contentType = resp.headers.get('content-type') || '';
        // Guard: only render if the response is actually an image
        if (!contentType.startsWith('image/')) {
          console.warn('[AuthedThumb] Non-image content-type:', contentType, 'for', downloadUrl);
          return;
        }
        const blob = await resp.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      } catch (err) {
        console.warn('[AuthedThumb] Failed to load thumbnail:', downloadUrl, err);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [downloadUrl]);

  if (!src) return <FileDocIcon />;
  return <FileThumbImg src={src} alt={alt} />;
};

const FileInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const FileName = styled.div`
  font-size: 13px;
  font-family: ${theme.fontFamily};
  color: ${theme.colors.textPrimary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const FileMeta = styled.div`
  font-size: 11px;
  font-family: ${theme.fontFamily};
  color: ${theme.colors.textMuted};
`;

const FileActions = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;

  ${FileRow}:hover & {
    opacity: 1;
  }
`;

const ActionButton = styled.button<{ $danger?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: ${theme.borderRadius.sm};
  background: transparent;
  color: ${(p) => (p.$danger ? theme.colors.error : theme.colors.textMuted)};
  cursor: pointer;

  &:hover {
    background: ${(p) => (p.$danger ? 'rgba(220, 53, 69, 0.1)' : theme.colors.background)};
  }
`;

const EmptyState = styled.div`
  padding: 32px 14px;
  text-align: center;
  font-size: 13px;
  font-family: ${theme.fontFamily};
  color: ${theme.colors.textMuted};
`;

const LoadingState = styled(EmptyState)`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
`;

/* ── Mobile Bottom Sheet Styles ── */

const MobileTabBar = styled.div`
  display: flex;
  gap: 4px;
  padding: 0 20px 12px;
  flex-shrink: 0;
`;

const MobileTab = styled.button<{ $active?: boolean }>`
  flex: 1;
  padding: 10px 16px;
  border: none;
  border-radius: 24px;
  background: ${(p) => (p.$active ? 'rgba(255, 255, 255, 0.15)' : 'transparent')};
  font-size: 14px;
  font-weight: 500;
  font-family: ${theme.fontFamily};
  color: ${(p) => (p.$active ? '#ffffff' : 'rgba(255, 255, 255, 0.5)')};
  cursor: pointer;
  transition: all 0.15s;
`;

const MobileFileRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);

  &:last-child {
    border-bottom: none;
  }
`;

const MobileFileIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.5);
  flex-shrink: 0;
  overflow: hidden;
`;

const MobileFileThumbImg = styled.img`
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: 8px;
`;

const MobileFileInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const MobileFileName = styled.div`
  font-size: 14px;
  font-family: ${theme.fontFamily};
  color: #ffffff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const MobileFileMeta = styled.div`
  font-size: 12px;
  font-family: ${theme.fontFamily};
  color: rgba(255, 255, 255, 0.5);
  margin-top: 2px;
`;

const MobileFileActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const MobileActionButton = styled.button<{ $danger?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: ${(p) => (p.$danger ? '#ef4444' : 'rgba(255, 255, 255, 0.5)')};
  cursor: pointer;
  padding: 0;

  &:active {
    background: rgba(255, 255, 255, 0.08);
  }
`;

const MobileEmptyState = styled.div`
  padding: 40px 20px;
  text-align: center;
  font-size: 14px;
  font-family: ${theme.fontFamily};
  color: rgba(255, 255, 255, 0.4);
`;

const MobileLoadingState = styled(MobileEmptyState)`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
`;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

const FolderIcon: React.FC = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const RefreshIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 4v6h-6" />
    <path d="M1 20v-6h6" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

const FileDocIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);

const DownloadIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const TrashIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
  </svg>
);

interface SessionFilesPanelProps {
  sessionId: string;
  /** When this value changes, files will auto-refresh (e.g., pass attachment count) */
  refreshTrigger?: number;
  /** Pass true when streaming, false when complete - refreshes on completion */
  isStreaming?: boolean;
  /** Suppress the inline trigger button. The panel/sheet still renders
      and can be opened via the imperative ref handle below. Used on
      native, where the chat-title dropdown owns the "Files" entry
      point and the header right is reserved for the new-chat button. */
  hideTrigger?: boolean;
}

export interface SessionFilesPanelHandle {
  open: () => void;
}

type FileTab = 'uploads' | 'generated';

const SessionFilesPanel = forwardRef<SessionFilesPanelHandle, SessionFilesPanelProps>(({ sessionId, refreshTrigger, isStreaming, hideTrigger }, ref) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<FileTab>('generated');
  const [badgeAnimate, setBadgeAnimate] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef<number>(0);
  const wasStreamingRef = useRef<boolean>(false);
  const isMobile = useIsMobile();
  const prevSessionIdForStreamRef = useRef(sessionId);
  const {
    files,
    uploadedFiles,
    generatedFiles,
    isLoading,
    refresh,
    deleteSessionFile,
  } = useSessionFiles(sessionId, refreshTrigger);

  const activeFiles = activeTab === 'uploads' ? uploadedFiles : generatedFiles;

  // Auto-refresh when streaming completes for the same session (not on session switch)
  useEffect(() => {
    if (prevSessionIdForStreamRef.current !== sessionId) {
      prevSessionIdForStreamRef.current = sessionId;
      wasStreamingRef.current = isStreaming ?? false;
      return;
    }
    if (wasStreamingRef.current && !isStreaming) {
      refresh();
    }
    wasStreamingRef.current = isStreaming ?? false;
  }, [sessionId, isStreaming, refresh]);

  // Animate badge when count changes
  useEffect(() => {
    if (files.length !== prevCountRef.current && prevCountRef.current !== 0) {
      setBadgeAnimate(true);
      const timer = setTimeout(() => setBadgeAnimate(false), 300);
      return () => clearTimeout(timer);
    }
    prevCountRef.current = files.length;
  }, [files.length]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    // On mobile the BottomSheet portal renders outside the Container ref,
    // so click-outside detection would incorrectly close the sheet on every tap.
    // The BottomSheet has its own backdrop-click and close-button handling.
    if (isOpen && !isMobile) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, isMobile]);

  const handleToggle = useCallback(() => {
    if (!isOpen) {
      refresh();
    }
    setIsOpen((prev) => !prev);
  }, [isOpen, refresh]);

  useImperativeHandle(ref, () => ({
    open: () => {
      refresh();
      setIsOpen(true);
    },
  }), [refresh]);

  const handleDownload = useCallback(async (file: SessionFile) => {
    try {
      await downloadFile(getGateway(), file.downloadUrl);
    } catch (err) {
      console.error('[SessionFilesPanel] Download error:', err);
    }
  }, []);

  const handleDelete = useCallback(
    async (file: SessionFile) => {
      const confirmed = window.confirm(`Delete "${file.name}"?`);
      if (confirmed) {
        await deleteSessionFile(file.path);
      }
    },
    [deleteSessionFile],
  );

  const isImageFile = (file: SessionFile) => file.mimeType?.startsWith('image/');

  const renderFileRow = (file: SessionFile) => (
    <FileRow key={file.path} onClick={() => handleDownload(file)}>
      <FileIcon>
        {isImageFile(file) ? (
          <AuthedThumb downloadUrl={file.downloadUrl} alt={file.name} />
        ) : (
          <FileDocIcon />
        )}
      </FileIcon>
      <FileInfo>
        <FileName title={file.name}>{file.name}</FileName>
        <FileMeta>
          {formatFileSize(file.size)} · {formatDate(file.createdAt)}
        </FileMeta>
      </FileInfo>
      <FileActions>
        <ActionButton
          onClick={(e) => {
            e.stopPropagation();
            handleDownload(file);
          }}
          title="Download"
        >
          <DownloadIcon />
        </ActionButton>
        <ActionButton
          $danger
          onClick={(e) => {
            e.stopPropagation();
            handleDelete(file);
          }}
          title="Delete"
        >
          <TrashIcon />
        </ActionButton>
      </FileActions>
    </FileRow>
  );

  const renderMobileFileRow = (file: SessionFile) => (
    <MobileFileRow key={file.path}>
      <MobileFileIcon>
        {isImageFile(file) ? (
          <AuthedThumb downloadUrl={file.downloadUrl} alt={file.name} />
        ) : (
          <FileDocIcon />
        )}
      </MobileFileIcon>
      <MobileFileInfo>
        <MobileFileName title={file.name}>{file.name}</MobileFileName>
        <MobileFileMeta>
          {formatFileSize(file.size)} {formatDate(file.createdAt)}
        </MobileFileMeta>
      </MobileFileInfo>
      <MobileFileActions>
        <MobileActionButton onClick={() => handleDownload(file)} title="Download">
          <DownloadIcon />
        </MobileActionButton>
        <MobileActionButton $danger onClick={() => handleDelete(file)} title="Delete">
          <TrashIcon />
        </MobileActionButton>
      </MobileFileActions>
    </MobileFileRow>
  );

  const fileListContent = (
    <>
      {isLoading && activeFiles.length === 0 ? (
        isMobile ? <MobileLoadingState>Loading...</MobileLoadingState> : <LoadingState>Loading...</LoadingState>
      ) : activeFiles.length === 0 ? (
        isMobile ? (
          <MobileEmptyState>No {activeTab === 'uploads' ? 'uploaded' : 'generated'} files</MobileEmptyState>
        ) : (
          <EmptyState>No {activeTab === 'uploads' ? 'uploaded' : 'generated'} files</EmptyState>
        )
      ) : (
        activeFiles.map(isMobile ? renderMobileFileRow : renderFileRow)
      )}
    </>
  );

  return (
    <Container ref={containerRef}>
      {!hideTrigger && (
        <TriggerButton onClick={handleToggle}>
          <FolderIcon />
          <TriggerLabel>Files</TriggerLabel>
          <TriggerStatus>
            {isLoading ? (
              <TriggerLoader aria-label="Loading files" />
            ) : (
              <Badge $animate={badgeAnimate} key={files.length}>
                ({files.length})
              </Badge>
            )}
          </TriggerStatus>
        </TriggerButton>
      )}

      {isMobile ? (
        <BottomSheet
          open={isOpen}
          onClose={() => setIsOpen(false)}
          title="Session files"
          height="60vh"
        >
          <MobileTabBar>
            <MobileTab $active={activeTab === 'generated'} onClick={() => setActiveTab('generated')}>
              Generated ({generatedFiles.length})
            </MobileTab>
            <MobileTab $active={activeTab === 'uploads'} onClick={() => setActiveTab('uploads')}>
              Uploads ({uploadedFiles.length})
            </MobileTab>
          </MobileTabBar>
          {fileListContent}
        </BottomSheet>
      ) : (
        isOpen && (
          <Dropdown>
            <DropdownHeader>
              Session Files
              <RefreshButton onClick={refresh} disabled={isLoading} title="Refresh">
                <RefreshIcon />
              </RefreshButton>
            </DropdownHeader>

            <TabBar>
              <Tab $active={activeTab === 'generated'} onClick={() => setActiveTab('generated')}>
                Generated
                <TabCount $active={activeTab === 'generated'}>{generatedFiles.length}</TabCount>
              </Tab>
              <Tab $active={activeTab === 'uploads'} onClick={() => setActiveTab('uploads')}>
                Uploads
                <TabCount $active={activeTab === 'uploads'}>{uploadedFiles.length}</TabCount>
              </Tab>
            </TabBar>

            <FileList>{fileListContent}</FileList>
          </Dropdown>
        )
      )}
    </Container>
  );
});

SessionFilesPanel.displayName = 'SessionFilesPanel';

export default SessionFilesPanel;
