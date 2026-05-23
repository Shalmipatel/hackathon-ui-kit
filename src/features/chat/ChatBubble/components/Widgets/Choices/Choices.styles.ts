import styled from 'styled-components';

export const ChoicesLoadingBox = styled.div`
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

export const ChoicesLoadingSpinner = styled.span`
  width: 16px;
  height: 16px;
  border: 2px solid rgba(36, 36, 36, 0.1);
  border-top-color: #242424;
  border-radius: 50%;
  flex-shrink: 0;
  display: block;
  animation: choicesSpin 0.8s linear infinite;

  @keyframes choicesSpin {
    to {
      transform: rotate(360deg);
    }
  }
`;

export const ChoicesScrollWrap = styled.div<{ $showLeft: boolean; $showRight: boolean }>`
  position: relative;
  width: 100%;

  &::before,
  &::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    width: 40px;
    pointer-events: none;
    z-index: 1;
    transition: opacity 0.2s ease;
  }

  &::before {
    left: 0;
    background: linear-gradient(to right, rgba(245, 243, 240, 0.95), transparent);
    opacity: ${(p) => (p.$showLeft ? 1 : 0)};
  }

  &::after {
    right: 0;
    background: linear-gradient(to left, rgba(245, 243, 240, 0.95), transparent);
    opacity: ${(p) => (p.$showRight ? 1 : 0)};
  }
`;

export const ChoicesRow = styled.div`
  display: flex;
  gap: 12px;
  align-items: stretch;
  overflow-x: auto;
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  -ms-overflow-style: none;
  padding: 4px 2px;

  &::-webkit-scrollbar {
    display: none;
  }
`;

export const ChoiceCard = styled.button<{ $selected: boolean; $disabled: boolean }>`
  flex: 0 0 auto;
  min-width: 120px;
  max-width: 200px;
  padding: 16px;
  background: ${(p) => (p.$selected ? 'rgba(36, 36, 36, 0.08)' : 'white')};
  border: 1px solid ${(p) => (p.$selected ? 'rgba(36, 36, 36, 0.3)' : 'rgba(36, 36, 36, 0.05)')};
  border-radius: 24px;
  cursor: ${(p) => (p.$disabled ? 'default' : 'pointer')};
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  font-size: 13px;
  color: rgba(36, 36, 36, 0.75);
  letter-spacing: -0.3px;
  line-height: 20px;
  text-align: left;
  outline: none;
  transition: border-color 0.15s ease, background 0.15s ease;
  opacity: ${(p) => (p.$disabled && !p.$selected ? 0.5 : 1)};

  &:hover {
    ${(p) =>
      !p.$disabled &&
      `
      border-color: rgba(36, 36, 36, 0.2);
      background: rgba(36, 36, 36, 0.03);
    `}
  }

  &:active {
    ${(p) =>
      !p.$disabled &&
      `
      transform: scale(0.98);
    `}
  }
`;
