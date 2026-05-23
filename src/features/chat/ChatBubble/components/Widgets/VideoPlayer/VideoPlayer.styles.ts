import styled from 'styled-components';

export const VideoLoadingBox = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 12px;
  background: rgba(36, 36, 36, 0.05);
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 500;
  color: rgba(36, 36, 36, 0.75);
  letter-spacing: -0.3px;
`;

export const VideoLoadingSpinner = styled.span`
  width: 16px;
  height: 16px;
  border: 2px solid rgba(36, 36, 36, 0.1);
  border-top-color: #242424;
  border-radius: 50%;
  flex-shrink: 0;
  display: block;
  animation: videoSpin 0.8s linear infinite;

  @keyframes videoSpin {
    to {
      transform: rotate(360deg);
    }
  }
`;

export const CardWrap = styled.div`
  width: 100%;
  border: 1px solid rgba(36, 36, 36, 0.1);
  border-radius: 12px;
  overflow: hidden;
  font-family: 'Inter', sans-serif;
`;

export const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 4px 16px;
  background: rgba(36, 36, 36, 0.1);
`;

export const HeaderTitle = styled.span`
  flex: 1;
  font-weight: 700;
  font-size: 13px;
  color: #242424;
  letter-spacing: -0.3px;
  line-height: 20px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const IconButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: none;
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  padding: 0;
  color: #242424;
  opacity: 0.6;
  outline: none;

  &:hover {
    opacity: 1;
  }
`;

export const VideoContainer = styled.div`
  position: relative;
  width: 100%;
  background: #000;
  cursor: pointer;

  &:fullscreen {
    display: flex;
    align-items: center;
    justify-content: center;
  }
`;

export const VideoElement = styled.video`
  width: 100%;
  display: block;
  max-height: 420px;
  object-fit: contain;

  :fullscreen & {
    max-height: 100vh;
    max-width: 100vw;
    height: 100%;
  }
`;

export const VideoOverlay = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.2);
`;

export const BigPlayButton = styled.button`
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  outline: none;
  transition: transform 0.15s ease;

  &:hover {
    transform: scale(1.08);
  }
`;

export const ControlsOverlay = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 12px 16px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.6));
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

export const ProgressBar = styled.div`
  width: 100%;
  height: 6px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 9999px;
  cursor: pointer;
  position: relative;
`;

export const VideoProgressFill = styled.div<{ $percent: number }>`
  height: 6px;
  background: white;
  border-radius: 9999px;
  width: ${(p) => p.$percent}%;
  transition: width 0.1s linear;
`;

export const ControlsRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

export const ControlsLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

export const ControlsRight = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

export const ControlButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: none;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  padding: 0;
  outline: none;
  color: #fbfaf9;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }
`;

export const TimeText = styled.span`
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  font-size: 13px;
  color: #fbfaf9;
  letter-spacing: -0.3px;
  white-space: nowrap;
`;

export const VolumeWrap = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 8px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 9999px;
`;

export const VolumeSlider = styled.input`
  width: 72px;
  height: 4px;
  appearance: none;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 9999px;
  outline: none;
  cursor: pointer;

  &::-webkit-slider-thumb {
    appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: white;
    cursor: pointer;
  }
`;
