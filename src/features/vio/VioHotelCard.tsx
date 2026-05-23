import React, { useState, useCallback, useEffect, useRef } from 'react';
import { MapPin, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import styled from 'styled-components';
import { theme } from '@/components/theme';
import type { Hotel } from './vio-types';
import VioStarRating from './VioStarRating';

const Card = styled.div`
  background: ${theme.colors.surface};
  border-radius: ${theme.borderRadius.md};
  box-shadow: ${theme.shadows.sm};
  overflow: hidden;
  cursor: pointer;
  transition: box-shadow 0.3s;
  &:hover {
    box-shadow: ${theme.shadows.md};
  }
`;

const ImageContainer = styled.div`
  position: relative;
  height: 200px;
  background: ${theme.colors.background};
  overflow: hidden;
`;

const HotelImage = styled.img<{ $active: boolean }>`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: opacity 0.2s;
  opacity: ${(p) => (p.$active ? 1 : 0)};
  z-index: ${(p) => (p.$active ? 1 : 0)};
`;

const NavButton = styled.button`
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 2;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s;
  &:hover {
    background: rgba(0, 0, 0, 0.7);
  }
`;

const NavPrev = styled(NavButton)`
  left: 8px;
`;
const NavNext = styled(NavButton)`
  right: 8px;
`;

const Dots = styled.div`
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  display: flex;
  gap: 6px;
`;

const Dot = styled.button<{ $active: boolean }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
  background: ${(p) => (p.$active ? 'white' : 'rgba(255,255,255,0.5)')};
  transform: ${(p) => (p.$active ? 'scale(1.25)' : 'scale(1)')};
  padding: 0;
`;

const PropertyTag = styled.span`
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 2;
  padding: 2px 8px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(4px);
  font-size: 12px;
  font-weight: 500;
  color: ${theme.colors.textPrimary};
  border-radius: ${theme.borderRadius.pill};
`;

const Content = styled.div`
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Header = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
`;

const HotelName = styled.h3`
  font-size: 15px;
  font-weight: 600;
  color: ${theme.colors.textPrimary};
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const RatingBadge = styled.div`
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
`;

const RatingScore = styled.div`
  width: 36px;
  height: 36px;
  border-radius: ${theme.borderRadius.sm};
  background: ${theme.colors.primaryVivid};
  color: white;
  font-weight: 700;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const RatingMeta = styled.div`
  text-align: right;
`;

const RatingLabel = styled.div`
  font-size: 12px;
  color: ${theme.colors.textSecondary};
`;

const ReviewCount = styled.div`
  font-size: 11px;
  color: ${theme.colors.textMuted};
`;

const Location = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: ${theme.colors.textSecondary};
  svg {
    flex-shrink: 0;
  }
`;

const LocationText = styled.span`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Insight = styled.p`
  font-size: 12px;
  color: ${theme.colors.textSecondary};
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const Tags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
`;

const Tag = styled.span<{ $color: string; $bg: string }>`
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 500;
  color: ${(p) => p.$color};
  background: ${(p) => p.$bg};
  border-radius: ${theme.borderRadius.pill};
`;

const PriceRow = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding-top: 8px;
  border-top: 1px solid ${theme.colors.background};
`;

const PriceLabel = styled.div`
  font-size: 12px;
  color: ${theme.colors.textSecondary};
`;

const PriceValue = styled.div`
  font-size: 20px;
  font-weight: 700;
  color: ${theme.colors.textPrimary};
`;

const PriceSub = styled.div`
  font-size: 11px;
  color: ${theme.colors.textMuted};
`;

const NoOffers = styled.div`
  font-size: 13px;
  color: ${theme.colors.textMuted};
`;

const BookButton = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  background: transparent;
  color: ${theme.colors.primaryVivid};
  font-size: 13px;
  font-weight: 600;
  border: 1.5px solid ${theme.colors.primaryVivid};
  border-radius: 8px;
  text-decoration: none;
  transition: all 0.15s;
  white-space: nowrap;
  &:hover {
    background: ${theme.colors.primaryVivid};
    color: white;
  }
`;

const NoImage = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${theme.colors.textMuted};
  font-size: 13px;
`;

function currencySymbol(c?: string) {
  if (c === 'EUR') return '€';
  if (c === 'GBP') return '£';
  return '$';
}

function ratingLabel(score: number) {
  if (score >= 9) return 'Exceptional';
  if (score >= 8) return 'Excellent';
  if (score >= 7) return 'Very Good';
  if (score >= 6) return 'Good';
  return 'Pleasant';
}

interface Props {
  hotel: Hotel;
  currency?: string;
  onSelect: (hotel: Hotel) => void;
}

const VioHotelCard: React.FC<Props> = React.memo(({ hotel, currency = 'USD', onSelect }) => {
  const [imgIdx, setImgIdx] = useState(0);
  const [failedImages, setFailedImages] = useState<Set<number>>(new Set());
  const images = hotel.media?.images || [];
  const cheapest = hotel.offers?.cheapestRate || hotel.offers?.items?.[0]?.rate;
  const hasFreeCancellation = hotel.offers?.items?.some((o) =>
    o.cancellationPenalties?.some((p) => p.amount === 0),
  );
  const touchStartX = useRef<number | null>(null);
  const sym = currencySymbol(currency);

  const handleImageError = useCallback((index: number) => {
    setFailedImages((prev) => new Set(prev).add(index));
  }, []);

  const loadableImages = images.filter((_, i) => !failedImages.has(i));

  useEffect(() => {
    if (images.length <= 1) return;
    images.forEach((src, i) => {
      if (i === 0) return;
      const img = new Image();
      img.src = src;
    });
  }, [images]);

  const prev = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setImgIdx((i) => (i - 1 + images.length) % images.length);
    },
    [images.length],
  );

  const next = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setImgIdx((i) => (i + 1) % images.length);
    },
    [images.length],
  );

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartX.current === null) return;
      const diff = e.changedTouches[0].clientX - touchStartX.current;
      touchStartX.current = null;
      if (Math.abs(diff) < 40) return;
      e.stopPropagation();
      if (diff < 0) {
        setImgIdx((i) => (i + 1) % images.length);
      } else {
        setImgIdx((i) => (i - 1 + images.length) % images.length);
      }
    },
    [images.length],
  );

  return (
    <Card onClick={() => onSelect(hotel)}>
      <ImageContainer
        onTouchStart={loadableImages.length > 1 ? onTouchStart : undefined}
        onTouchEnd={loadableImages.length > 1 ? onTouchEnd : undefined}
      >
        {images.length > 0 ? (
          images.map((src, i) => (
            <HotelImage
              key={src}
              src={src}
              alt={i === imgIdx ? hotel.name : ''}
              $active={i === imgIdx}
              onError={() => handleImageError(i)}
              style={failedImages.has(i) ? { display: 'none' } : undefined}
            />
          ))
        ) : null}
        {loadableImages.length === 0 && (
          <NoImage>No image available</NoImage>
        )}
        {loadableImages.length > 1 && (
          <>
            <NavPrev onClick={prev}>
              <ChevronLeft size={18} />
            </NavPrev>
            <NavNext onClick={next}>
              <ChevronRight size={18} />
            </NavNext>
            <Dots>
              {images.map((_, i) =>
                failedImages.has(i) ? null : (
                  <Dot
                    key={i}
                    $active={i === imgIdx}
                    onClick={(e) => {
                      e.stopPropagation();
                      setImgIdx(i);
                    }}
                  />
                ),
              )}
            </Dots>
          </>
        )}
        {hotel.classification?.propertyType && (
          <PropertyTag>{hotel.classification.propertyType.name}</PropertyTag>
        )}
      </ImageContainer>

      <Content>
        <Header>
          <div style={{ minWidth: 0 }}>
            <HotelName>{hotel.name}</HotelName>
            <VioStarRating rating={hotel.classification?.starRating} />
          </div>
          {hotel.rating && (
            <RatingBadge>
              <RatingMeta>
                <RatingLabel>{ratingLabel(hotel.rating.overall)}</RatingLabel>
                {hotel.rating.reviewCount != null && (
                  <ReviewCount>{hotel.rating.reviewCount.toLocaleString()} reviews</ReviewCount>
                )}
              </RatingMeta>
              <RatingScore>{hotel.rating.overall.toFixed(1)}</RatingScore>
            </RatingBadge>
          )}
        </Header>

        {hotel.location && (
          <Location>
            <MapPin size={14} />
            <LocationText>{hotel.location.displayName}</LocationText>
          </Location>
        )}

        {hotel.insights?.overall && <Insight>{hotel.insights.overall}</Insight>}

        <Tags>
          {hasFreeCancellation && (
            <Tag $color="#15803d" $bg="#f0fdf4">
              Free cancellation
            </Tag>
          )}
          {hotel.offers?.items?.[0]?.tags?.includes('price_drop') && (
            <Tag $color="#dc2626" $bg="#fef2f2">
              Price drop
            </Tag>
          )}
          {hotel.offers?.items?.[0]?.package?.amenities?.map((a) => (
            <Tag key={a} $color="#2563eb" $bg="#eff6ff">
              {a}
            </Tag>
          ))}
        </Tags>

        <PriceRow>
          {cheapest ? (
            <div>
              <PriceLabel>From</PriceLabel>
              <PriceValue>
                {sym}
                {Math.round(cheapest.displayPrice).toLocaleString()}
              </PriceValue>
              <PriceSub>total stay</PriceSub>
            </div>
          ) : (
            <NoOffers>No offers available</NoOffers>
          )}
          <BookButton
            href={hotel.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            Book <ExternalLink size={14} />
          </BookButton>
        </PriceRow>
      </Content>
    </Card>
  );
}, (prev, next) => prev.hotel.id === next.hotel.id && prev.currency === next.currency);

VioHotelCard.displayName = 'VioHotelCard';

export default VioHotelCard;
