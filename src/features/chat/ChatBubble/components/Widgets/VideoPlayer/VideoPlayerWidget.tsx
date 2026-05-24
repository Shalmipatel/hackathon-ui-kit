import React, { useState, useRef, useCallback, useEffect } from 'react';
import { downloadFile } from '@/providers/files';
import { getGateway } from '@/features/app/bootstrap/providers';
import { parseVideoJson } from './videoPlayerUtils';
import {
  VideoLoadingBox,
  VideoLoadingSpinner,
  CardWrap,
  Header,
  HeaderTitle,
  IconButton,
  VideoContainer,
  VideoElement,
  VideoOverlay,
  BigPlayButton,
  ControlsOverlay,
  ProgressBar,
  VideoProgressFill,
  ControlsRow,
  ControlsLeft,
  ControlsRight,
  ControlButton,
  TimeText,
  VolumeWrap,
  VolumeSlider,
} from './VideoPlayer.styles';

interface VideoData {
  src: string;
  title: string;
  poster?: string;
}

interface VideoPlayerWidgetProps {
  json: string;
  isComplete: boolean;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function useAuthenticatedMediaUrl(src: string | undefined): string | null {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!src) return;

    if (src.startsWith('blob:')) {
      setBlobUrl(src);
      return;
    }

    let revoked = false;
    let objectUrl: string | null = null;

    (async () => {
      try {
        const gateway = getGateway();
        const prepared = await gateway.prepareRequest(src, { method: 'GET' });
        const resp = await fetch(prepared.url, prepared.init);
        if (!resp.ok) return;
        const blob = await resp.blob();
        if (revoked) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      } catch (err) {
        console.error('[VideoPlayerWidget] Failed to load video:', err);
      }
    })();

    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  return blobUrl;
}

const PlayIcon = ({ size = 24, color = '#DCE1DE' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M8 5v14l11-7z" />
  </svg>
);

const PauseIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="#DCE1DE">
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </svg>
);

const VolumeIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#DCE1DE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
  </svg>
);

const VolumeMuteIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#DCE1DE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <line x1="23" y1="9" x2="17" y2="15" />
    <line x1="17" y1="9" x2="23" y2="15" />
  </svg>
);

const ExpandIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#DCE1DE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 3 21 3 21 9" />
    <polyline points="9 21 3 21 3 15" />
    <line x1="21" y1="3" x2="14" y2="10" />
    <line x1="3" y1="21" x2="10" y2="14" />
  </svg>
);

const DownloadIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

export const VideoPlayerWidget: React.FC<VideoPlayerWidgetProps> = React.memo(
  ({ json, isComplete }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [hasStarted, setHasStarted] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [showControls, setShowControls] = useState(false);
    const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const data = isComplete ? parseVideoJson<VideoData>(json) : null;
    const blobUrl = useAuthenticatedMediaUrl(data?.src);

    const scheduleHide = useCallback(() => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => setShowControls(false), 3000);
    }, []);

    const handleMouseMove = useCallback(() => {
      if (hasStarted) {
        setShowControls(true);
        scheduleHide();
      }
    }, [hasStarted, scheduleHide]);

    useEffect(() => {
      return () => {
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      };
    }, []);

    if (!isComplete) {
      return (
        <VideoLoadingBox>
          <VideoLoadingSpinner />
          Preparing video...
        </VideoLoadingBox>
      );
    }

    if (!data?.src) return null;

    if (!blobUrl) {
      return (
        <VideoLoadingBox>
          <VideoLoadingSpinner />
          Loading video...
        </VideoLoadingBox>
      );
    }

    const percent = duration > 0 ? (currentTime / duration) * 100 : 0;

    const handleTimeUpdate = () => {
      if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
    };

    const handleLoadedMetadata = () => {
      if (videoRef.current) setDuration(videoRef.current.duration);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setShowControls(true);
    };

    const togglePlay = () => {
      const video = videoRef.current;
      if (!video) return;

      if (isPlaying) {
        video.pause();
        setIsPlaying(false);
      } else {
        if (!hasStarted) setHasStarted(true);
        video.play().catch(() => {});
        setIsPlaying(true);
        setShowControls(true);
        scheduleHide();
      }
    };

    const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
      const video = videoRef.current;
      if (!video || !duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      video.currentTime = ratio * duration;
      setCurrentTime(video.currentTime);
    };

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value);
      setVolume(val);
      setIsMuted(val === 0);
      if (videoRef.current) {
        videoRef.current.volume = val;
        videoRef.current.muted = val === 0;
      }
    };

    const toggleMute = () => {
      const video = videoRef.current;
      if (!video) return;
      const newMuted = !isMuted;
      setIsMuted(newMuted);
      video.muted = newMuted;
      if (!newMuted && volume === 0) {
        setVolume(0.5);
        video.volume = 0.5;
      }
    };

    const handleFullscreen = () => {
      const el = containerRef.current;
      if (!el) return;
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        el.requestFullscreen().catch(() => {});
      }
    };

    const handleDownload = async () => {
      try {
        await downloadFile(getGateway(), data.src);
      } catch (err) {
        console.error('[VideoPlayerWidget] Download error:', err);
      }
    };

    return (
      <CardWrap>
        <Header>
          <HeaderTitle>{data.title}</HeaderTitle>
          <IconButton onClick={handleDownload} type="button" title="Download">
            <DownloadIcon />
          </IconButton>
        </Header>
        <VideoContainer
          ref={containerRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => isPlaying && setShowControls(false)}
        >
          <VideoElement
            ref={videoRef}
            src={blobUrl}
            preload="metadata"
            onClick={togglePlay}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={handleEnded}
          />

          {!hasStarted && (
            <VideoOverlay onClick={togglePlay}>
              <BigPlayButton type="button">
                <PlayIcon size={40} color="white" />
              </BigPlayButton>
            </VideoOverlay>
          )}

          {hasStarted && showControls && (
            <ControlsOverlay>
              <ProgressBar onClick={handleSeek}>
                <VideoProgressFill $percent={percent} />
              </ProgressBar>
              <ControlsRow>
                <ControlsLeft>
                  <ControlButton onClick={togglePlay} type="button">
                    {isPlaying ? <PauseIcon /> : <PlayIcon />}
                  </ControlButton>
                  <TimeText>
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </TimeText>
                </ControlsLeft>
                <ControlsRight>
                  <VolumeWrap>
                    <VolumeSlider
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={isMuted ? 0 : volume}
                      onChange={handleVolumeChange}
                    />
                    <ControlButton onClick={toggleMute} type="button">
                      {isMuted || volume === 0 ? <VolumeMuteIcon /> : <VolumeIcon />}
                    </ControlButton>
                  </VolumeWrap>
                  <ControlButton onClick={handleFullscreen} type="button">
                    <ExpandIcon />
                  </ControlButton>
                </ControlsRight>
              </ControlsRow>
            </ControlsOverlay>
          )}
        </VideoContainer>
      </CardWrap>
    );
  },
);

VideoPlayerWidget.displayName = 'VideoPlayerWidget';
