import styled from 'styled-components';

export const AudioLoadingBox = styled.div`
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

export const AudioLoadingSpinner = styled.span`
  width: 16px;
  height: 16px;
  border: 2px solid rgba(36, 36, 36, 0.1);
  border-top-color: #242424;
  border-radius: 50%;
  flex-shrink: 0;
  display: block;
  animation: audioSpin 0.8s linear infinite;

  @keyframes audioSpin {
    to {
      transform: rotate(360deg);
    }
  }
`;

export const PlayerWrap = styled.div`
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 16px;
  background: rgba(36, 36, 36, 0.05);
  border-radius: 9999px;
  width: 100%;
  box-sizing: border-box;
  position: relative;
`;

export const TrackArea = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 1;
  gap: 8px;
  min-width: 0;
`;

export const TimeLabel = styled.span`
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  font-size: 13px;
  color: rgba(36, 36, 36, 0.75);
  letter-spacing: -0.3px;
  line-height: 20px;
  text-align: center;
  width: 50px;
  flex-shrink: 0;
`;

export const ProgressBarWrap = styled.div`
  flex: 1;
  height: 8px;
  background: rgba(36, 36, 36, 0.1);
  border-radius: 9999px;
  cursor: pointer;
  position: relative;
  min-width: 60px;
`;

export const ProgressFill = styled.div<{ $percent: number }>`
  height: 8px;
  background: #242424;
  border-radius: 9999px;
  width: ${(p) => p.$percent}%;
  transition: width 0.1s linear;
`;

export const SpeedButton = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px 8px;
  width: 50px;
  background: rgba(36, 36, 36, 0.05);
  border: none;
  border-radius: 9999px;
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  font-size: 13px;
  color: rgba(36, 36, 36, 0.75);
  letter-spacing: -0.3px;
  cursor: pointer;
  flex-shrink: 0;
  outline: none;

  &:hover {
    background: rgba(36, 36, 36, 0.1);
  }
`;

export const PlayStopButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: #216869;
  border: 2px solid #242424;
  border-radius: 24px;
  cursor: pointer;
  flex-shrink: 0;
  outline: none;
  transition: opacity 0.15s ease, transform 0.1s ease;

  &:hover {
    opacity: 0.85;
  }

  &:active {
    transform: scale(0.95);
  }
`;

export const SpeedPopup = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: #f0efee;
  border-radius: 9999px;
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.06);
  position: absolute;
  right: 72px;
  top: calc(100% + 4px);
  z-index: 10;
`;

export const SpeedOption = styled.button<{ $active: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px 8px;
  width: 50px;
  background: ${(p) => (p.$active ? 'rgba(36, 36, 36, 0.12)' : 'rgba(36, 36, 36, 0.05)')};
  border: none;
  border-radius: 9999px;
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  font-size: 13px;
  color: rgba(36, 36, 36, 0.75);
  cursor: pointer;
  outline: none;

  &:hover {
    background: rgba(36, 36, 36, 0.15);
  }
`;
