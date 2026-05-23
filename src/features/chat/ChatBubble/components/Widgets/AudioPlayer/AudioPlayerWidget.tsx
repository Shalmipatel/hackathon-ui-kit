import React, { useState, useRef, useEffect } from 'react';
import { getGateway } from '@/features/app/bootstrap/providers';
import { parseAudioJson } from './audioPlayerUtils';
import {
  AudioLoadingBox,
  AudioLoadingSpinner,
  PlayerWrap,
  TrackArea,
  TimeLabel,
  ProgressBarWrap,
  ProgressFill,
  SpeedButton,
  PlayStopButton,
  SpeedPopup,
  SpeedOption,
} from './AudioPlayer.styles';

interface AudioData {
  src: string;
  title?: string;
}

interface AudioPlayerWidgetProps {
  json: string;
  isComplete: boolean;
}

const PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const PlayIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="#242424">
    <path d="M8 5v14l11-7z" />
  </svg>
);

const StopIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="#242424">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);

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
        console.error('[AudioPlayerWidget] Failed to load audio:', err);
      }
    })();

    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  return blobUrl;
}

export const AudioPlayerWidget: React.FC<AudioPlayerWidgetProps> = React.memo(
  ({ json, isComplete }) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [showSpeedPopup, setShowSpeedPopup] = useState(false);

    const data = isComplete ? parseAudioJson<AudioData>(json) : null;
    const blobUrl = useAuthenticatedMediaUrl(data?.src);

    if (!isComplete) {
      return (
        <AudioLoadingBox>
          <AudioLoadingSpinner />
          Preparing audio...
        </AudioLoadingBox>
      );
    }

    if (!data?.src) return null;

    if (!blobUrl) {
      return (
        <AudioLoadingBox>
          <AudioLoadingSpinner />
          Loading audio...
        </AudioLoadingBox>
      );
    }

    const percent = duration > 0 ? (currentTime / duration) * 100 : 0;

    const handleTimeUpdate = () => {
      if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
    };

    const handleLoadedMetadata = () => {
      if (audioRef.current) setDuration(audioRef.current.duration);
    };

    const handleEnded = () => setIsPlaying(false);

    const togglePlay = () => {
      const audio = audioRef.current;
      if (!audio) return;

      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        audio.play().catch(() => {});
        setIsPlaying(true);
      }
    };

    const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
      const audio = audioRef.current;
      if (!audio || !duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      audio.currentTime = ratio * duration;
      setCurrentTime(audio.currentTime);
    };

    const handleSpeedChange = (speed: number) => {
      setPlaybackRate(speed);
      if (audioRef.current) audioRef.current.playbackRate = speed;
      setShowSpeedPopup(false);
    };

    return (
      <>
        <audio
          ref={audioRef}
          src={blobUrl}
          preload="metadata"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
        />
        <PlayerWrap>
          <TrackArea>
            <TimeLabel>{formatTime(currentTime)}</TimeLabel>
            <ProgressBarWrap onClick={handleSeek}>
              <ProgressFill $percent={percent} />
            </ProgressBarWrap>
            <TimeLabel>{formatTime(duration)}</TimeLabel>
          </TrackArea>

          <SpeedButton onClick={() => setShowSpeedPopup((v) => !v)}>
            {playbackRate}x
          </SpeedButton>

          <PlayStopButton onClick={togglePlay} type="button">
            {isPlaying ? <StopIcon /> : <PlayIcon />}
          </PlayStopButton>

          {showSpeedPopup && (
            <SpeedPopup>
              {PLAYBACK_SPEEDS.map((speed) => (
                <SpeedOption
                  key={speed}
                  $active={playbackRate === speed}
                  onClick={() => handleSpeedChange(speed)}
                  type="button"
                >
                  {speed}x
                </SpeedOption>
              ))}
            </SpeedPopup>
          )}
        </PlayerWrap>
      </>
    );
  },
);

AudioPlayerWidget.displayName = 'AudioPlayerWidget';
