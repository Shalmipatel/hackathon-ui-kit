import React from 'react';
import styled from 'styled-components';

/* ── Types ── */

export interface WebLinkPreviewProps {
  url: string;
  title: string;
  description: string;
  imageUrl?: string;
  favicon?: string;
  onClick?: () => void;
}

/* ── Styled Components ── */

const Wrap = styled.a`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  width: 100%;
  max-width: 722px;
  text-decoration: none;
  cursor: pointer;
`;

const UrlRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
`;

const Favicon = styled.img`
  width: 16px;
  height: 16px;
  border-radius: 3px;
  flex-shrink: 0;
  object-fit: contain;
`;

const UrlText = styled.span`
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  font-size: 13px;
  color: rgba(36, 36, 36, 0.5);
  letter-spacing: -0.3px;
  line-height: 20px;
  text-decoration: underline;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  ${Wrap}:hover & {
    color: #242424;
  }
`;

const Card = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
  padding-left: 16px;
  width: 100%;
  position: relative;
  box-sizing: border-box;
`;

const AccentBar = styled.div`
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: rgba(36, 36, 36, 0.1);
  border-radius: 0 4px 4px 0;
`;

const Title = styled.span`
  font-family: 'Inter', sans-serif;
  font-weight: 800;
  font-size: 13px;
  color: #242424;
  letter-spacing: -0.3px;
  line-height: 16px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
  transition: text-decoration 0.15s ease;

  ${Wrap}:hover & {
    text-decoration: underline;
  }
`;

const Description = styled.span`
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  font-size: 15px;
  color: #242424;
  letter-spacing: -0.3px;
  line-height: 24px;
  width: 100%;
`;

const Thumbnail = styled.img`
  max-width: 100%;
  max-height: 200px;
  border-radius: 8px;
  object-fit: cover;
  background: rgba(36, 36, 36, 0.03);
`;

/* ── Component ── */

const WebLinkPreview: React.FC<WebLinkPreviewProps> = ({
  url,
  title,
  description,
  imageUrl,
  favicon,
  onClick,
}) => {
  const handleClick = (e: React.MouseEvent) => {
    if (onClick) {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <Wrap href={url} target="_blank" rel="noopener noreferrer" onClick={handleClick}>
      <UrlRow>
        {favicon && <Favicon src={favicon} alt="" />}
        <UrlText>{url}</UrlText>
      </UrlRow>
      <Card>
        <AccentBar />
        <Title>{title}</Title>
        {description && <Description>{description}</Description>}
        {imageUrl && <Thumbnail src={imageUrl} alt={title} />}
      </Card>
    </Wrap>
  );
};

export default WebLinkPreview;
