import React, { useState, useEffect } from 'react';
import {
  X, Star, MapPin, Phone, Wifi, Car, Coffee, Dumbbell,
  ChevronLeft, ChevronRight, ExternalLink, Clock, MessageSquare,
  HelpCircle, TrendingUp, TrendingDown, Minus, Shield,
} from 'lucide-react';
import styled, { keyframes } from 'styled-components';
import { theme } from '@/components/theme';
import type { Hotel, Offer } from './vio-types';
import VioStarRating from './VioStarRating';

const fadeIn = keyframes`
  from { opacity: 0; transform: scale(0.96); }
  to { opacity: 1; transform: scale(1); }
`;

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
`;

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
`;

const Panel = styled.div`
  position: relative;
  width: 100%;
  max-width: 720px;
  max-height: calc(100vh - 48px);
  background: ${theme.colors.surface};
  border-radius: 20px;
  box-shadow: ${theme.shadows.lg};
  overflow-y: auto;
  animation: ${fadeIn} 0.25s ease;
  z-index: 1;
`;

const CloseBtn = styled.button`
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 10;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(4px);
  box-shadow: ${theme.shadows.sm};
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s;
  &:hover {
    background: ${theme.colors.background};
  }
`;

const GallerySection = styled.div`
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 20px 20px 0 0;
`;

const Gallery = styled.div`
  position: relative;
  height: 320px;
  background: ${theme.colors.background};
  flex-shrink: 0;
`;

const GalleryImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
`;

const GalleryNav = styled.button<{ $side: 'left' | 'right' }>`
  position: absolute;
  ${(p) => (p.$side === 'left' ? 'left: 16px;' : 'right: 16px;')}
  top: 50%;
  transform: translateY(-50%);
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.4);
  color: white;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  &:hover {
    background: rgba(0, 0, 0, 0.6);
  }
`;

const Counter = styled.div`
  position: absolute;
  bottom: 12px;
  right: 16px;
  padding: 4px 8px;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  font-size: 12px;
  border-radius: ${theme.borderRadius.pill};
`;

const Thumbnails = styled.div`
  display: flex;
  gap: 6px;
  padding: 10px 12px;
  overflow-x: auto;
  background: ${theme.colors.background};
  flex-shrink: 0;
  &::-webkit-scrollbar {
    height: 4px;
  }
  &::-webkit-scrollbar-thumb {
    background: ${theme.colors.border};
    border-radius: 2px;
  }
`;

const Thumb = styled.img<{ $active: boolean }>`
  width: 60px;
  height: 44px;
  object-fit: cover;
  border-radius: 6px;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s;
  opacity: ${(p) => (p.$active ? 1 : 0.6)};
  outline: ${(p) => (p.$active ? `2px solid ${theme.colors.primaryVivid}` : 'none')};
  outline-offset: 1px;
  display: block;
  &:hover {
    opacity: 1;
  }
`;

const HeaderSection = styled.div`
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const TitleRow = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
`;

const Title = styled.h2`
  font-size: 22px;
  font-weight: 700;
  color: ${theme.colors.textPrimary};
  margin: 0;
`;

const RatingBox = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const RatingScore = styled.div`
  width: 48px;
  height: 48px;
  border-radius: ${theme.borderRadius.md};
  background: ${theme.colors.primaryVivid};
  color: white;
  font-weight: 700;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const InfoRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: ${theme.colors.textSecondary};
`;

const AnalyticsBox = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: ${theme.borderRadius.sm};
  background: ${theme.colors.background};
  font-size: 13px;
`;

const Spinner = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  gap: 8px;
  font-size: 13px;
  color: ${theme.colors.textSecondary};
`;

const SpinnerDot = styled.div`
  width: 24px;
  height: 24px;
  border: 2px solid ${theme.colors.primaryVivid};
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

const TabBar = styled.div`
  position: sticky;
  top: 0;
  background: ${theme.colors.surface};
  border-bottom: 1px solid ${theme.colors.border};
  z-index: 10;
  display: flex;
  overflow-x: auto;
  padding: 0 24px;
`;

const Tab = styled.button<{ $active: boolean }>`
  padding: 12px 16px;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  border: none;
  background: none;
  cursor: pointer;
  transition: color 0.15s;
  border-bottom: 2px solid ${(p) => (p.$active ? theme.colors.primaryVivid : 'transparent')};
  color: ${(p) => (p.$active ? theme.colors.primaryVivid : theme.colors.textSecondary)};
  &:hover {
    color: ${theme.colors.textPrimary};
  }
`;

const TabContent = styled.div`
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const SectionTitle = styled.h3`
  font-size: 15px;
  font-weight: 600;
  color: ${theme.colors.textPrimary};
  margin: 0 0 8px 0;
`;

const OfferCard = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border-radius: ${theme.borderRadius.sm};
  border: 1px solid ${theme.colors.border};
  transition: border-color 0.15s;
  &:hover {
    border-color: ${theme.colors.primary};
  }
`;

const OfferInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
`;

const OfferRoom = styled.div`
  font-size: 14px;
  font-weight: 500;
  color: ${theme.colors.textPrimary};
`;

const OfferProvider = styled.div`
  font-size: 12px;
  color: ${theme.colors.textSecondary};
`;

const OfferTags = styled.div`
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
`;

const OfferTag = styled.span<{ $color: string; $bg: string }>`
  padding: 2px 6px;
  font-size: 11px;
  color: ${(p) => p.$color};
  background: ${(p) => p.$bg};
  border-radius: 4px;
`;

const OfferPrice = styled.div`
  text-align: right;
  flex-shrink: 0;
  margin-left: 16px;
`;

const OfferAmount = styled.div`
  font-size: 18px;
  font-weight: 700;
  color: ${theme.colors.textPrimary};
`;

const BookBtn = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  padding: 5px 12px;
  background: transparent;
  color: ${theme.colors.primaryVivid};
  font-size: 12px;
  font-weight: 600;
  border: 1.5px solid ${theme.colors.primaryVivid};
  border-radius: 8px;
  text-decoration: none;
  transition: all 0.15s;
  &:hover {
    background: ${theme.colors.primaryVivid};
    color: white;
  }
`;

const InsightGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
`;

const InsightCard = styled.div`
  padding: 12px;
  border-radius: ${theme.borderRadius.sm};
  background: ${theme.colors.background};
`;

const InsightCategory = styled.div`
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  color: ${theme.colors.primaryVivid};
`;

const InsightTitle = styled.div`
  font-size: 13px;
  font-weight: 500;
  color: ${theme.colors.textPrimary};
  margin-top: 2px;
`;

const InsightSummary = styled.div`
  font-size: 12px;
  color: ${theme.colors.textSecondary};
  margin-top: 2px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const RatingBarRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const RatingBarLabel = styled.span`
  font-size: 13px;
  color: ${theme.colors.textSecondary};
  width: 96px;
  text-transform: capitalize;
`;

const RatingBarTrack = styled.div`
  flex: 1;
  height: 8px;
  background: ${theme.colors.background};
  border-radius: 4px;
  overflow: hidden;
`;

const RatingBarFill = styled.div<{ $pct: number }>`
  height: 100%;
  background: ${theme.colors.primary};
  border-radius: 4px;
  width: ${(p) => p.$pct}%;
`;

const RatingBarValue = styled.span`
  font-size: 13px;
  font-weight: 500;
  color: ${theme.colors.textPrimary};
  width: 32px;
`;

const ReviewCard = styled.div`
  padding: 16px;
  border: 1px solid ${theme.colors.border};
  border-radius: ${theme.borderRadius.md};
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const FacilityChip = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: ${theme.colors.background};
  border-radius: ${theme.borderRadius.sm};
  font-size: 13px;
  color: ${theme.colors.textPrimary};
`;

const FacilityGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const FaqItem = styled.details`
  border: 1px solid ${theme.colors.border};
  border-radius: ${theme.borderRadius.md};
  overflow: hidden;
  & > summary {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 16px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    color: ${theme.colors.textPrimary};
    &:hover {
      background: ${theme.colors.background};
    }
  }
`;

const FaqAnswer = styled.div`
  padding: 0 16px 16px;
  font-size: 13px;
  color: ${theme.colors.textSecondary};
`;

const PolicyBlock = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 12px;
`;

const PolicyTitle = styled.h4`
  font-weight: 500;
  font-size: 14px;
  color: ${theme.colors.textPrimary};
  margin: 0;
`;

const PolicyText = styled.p`
  font-size: 13px;
  color: ${theme.colors.textSecondary};
  margin: 0;
  white-space: pre-line;
`;

const WarningBox = styled.div`
  padding: 16px;
  background: #fffbeb;
  border-radius: ${theme.borderRadius.md};
`;

const RoomCard = styled.div`
  border: 1px solid ${theme.colors.border};
  border-radius: ${theme.borderRadius.md};
  overflow: hidden;
`;

const RoomImage = styled.img`
  width: 100%;
  height: 160px;
  object-fit: cover;
`;

const RoomContent = styled.div`
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const RoomName = styled.h4`
  font-weight: 600;
  font-size: 15px;
  color: ${theme.colors.textPrimary};
  margin: 0;
`;

const RoomMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const RoomMetaTag = styled.span`
  font-size: 12px;
  background: ${theme.colors.background};
  padding: 4px 8px;
  border-radius: 4px;
`;

const EmptyText = styled.p`
  color: ${theme.colors.textSecondary};
  font-size: 13px;
  margin: 0;
`;

const TextBlock = styled.p`
  font-size: 13px;
  color: ${theme.colors.textSecondary};
  margin: 0;
  line-height: 1.6;
`;

type TabId = 'overview' | 'rooms' | 'reviews' | 'facilities' | 'faq' | 'policies';

function facilityIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes('wifi') || n.includes('internet')) return <Wifi size={16} />;
  if (n.includes('parking') || n.includes('car')) return <Car size={16} />;
  if (n.includes('breakfast') || n.includes('restaurant') || n.includes('coffee'))
    return <Coffee size={16} />;
  if (n.includes('gym') || n.includes('fitness')) return <Dumbbell size={16} />;
  return null;
}

interface Props {
  hotel: Hotel;
  currency?: string;
  checkIn?: string;
  checkOut?: string;
  onClose: () => void;
  onLoadDetails?: (hotelId: string) => Promise<Hotel | null>;
}

const VioHotelDetail: React.FC<Props> = ({
  hotel: initialHotel,
  currency = 'USD',
  checkIn,
  checkOut,
  onClose,
  onLoadDetails,
}) => {
  const [hotel, setHotel] = useState(initialHotel);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [imgIdx, setImgIdx] = useState(0);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    if (onLoadDetails) {
      setLoading(true);
      onLoadDetails(initialHotel.id)
        .then((detail) => {
          if (detail) setHotel((prev) => ({ ...prev, ...detail }));
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [initialHotel.id, onLoadDetails]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const images = hotel.media?.images || [];
  const sym = currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$';

  function formatPrice(price: number) {
    return `${sym}${Math.round(price).toLocaleString()}`;
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'rooms', label: 'Rooms' },
    { id: 'reviews', label: 'Reviews' },
    { id: 'facilities', label: 'Facilities' },
    { id: 'faq', label: 'FAQ' },
    { id: 'policies', label: 'Policies' },
  ];

  function OfferRow({ offer }: { offer: Offer }) {
    const hasFreeCancellation = offer.cancellationPenalties?.some((p) => p.amount === 0);
    return (
      <OfferCard>
        <OfferInfo>
          <OfferRoom>{offer.roomName || 'Standard Room'}</OfferRoom>
          <OfferProvider>{offer.providerName}</OfferProvider>
          <OfferTags>
            {hasFreeCancellation && (
              <OfferTag $color="#15803d" $bg="#f0fdf4">Free cancellation</OfferTag>
            )}
            {offer.package?.amenities?.map((a) => (
              <OfferTag key={a} $color="#2563eb" $bg="#eff6ff">{a}</OfferTag>
            ))}
            {offer.tags?.includes('cheapest_offer') && (
              <OfferTag $color="#b45309" $bg="#fffbeb">Best price</OfferTag>
            )}
          </OfferTags>
        </OfferInfo>
        <OfferPrice>
          <OfferAmount>{formatPrice(offer.rate.displayPrice)}</OfferAmount>
          <BookBtn href={offer.url} target="_blank" rel="noopener noreferrer">
            Book <ExternalLink size={12} />
          </BookBtn>
        </OfferPrice>
      </OfferCard>
    );
  }

  return (
    <Overlay>
      <Backdrop onClick={onClose} />
      <Panel>
        <CloseBtn onClick={onClose}>
          <X size={20} color={theme.colors.textSecondary} />
        </CloseBtn>

        <GallerySection>
          <Gallery>
            {images.length > 0 && (
              <GalleryImage src={images[imgIdx]} alt={hotel.name} />
            )}
            {images.length > 1 && (
              <>
                <GalleryNav
                  $side="left"
                  onClick={() => setImgIdx((i) => (i - 1 + images.length) % images.length)}
                >
                  <ChevronLeft size={20} />
                </GalleryNav>
                <GalleryNav
                  $side="right"
                  onClick={() => setImgIdx((i) => (i + 1) % images.length)}
                >
                  <ChevronRight size={20} />
                </GalleryNav>
                <Counter>
                  {imgIdx + 1} / {images.length}
                </Counter>
              </>
            )}
          </Gallery>

          {images.length > 1 && (
            <Thumbnails>
              {images.map((img, i) => (
                <Thumb key={i} src={img} alt="" $active={i === imgIdx} onClick={() => setImgIdx(i)} />
              ))}
            </Thumbnails>
          )}
        </GallerySection>

        <HeaderSection>
          <TitleRow>
            <div>
              <Title>{hotel.name}</Title>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                <VioStarRating rating={hotel.classification?.starRating} />
                {hotel.classification?.propertyType && (
                  <span style={{ fontSize: 13, color: theme.colors.textSecondary }}>
                    {hotel.classification.propertyType.name}
                  </span>
                )}
              </div>
            </div>
            {hotel.rating && (
              <RatingBox>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: theme.colors.textPrimary }}>
                    {hotel.rating.overall >= 9
                      ? 'Exceptional'
                      : hotel.rating.overall >= 8
                        ? 'Excellent'
                        : hotel.rating.overall >= 7
                          ? 'Very Good'
                          : 'Good'}
                  </div>
                  <div style={{ fontSize: 12, color: theme.colors.textSecondary }}>
                    {hotel.rating.reviewCount?.toLocaleString()} reviews
                  </div>
                </div>
                <RatingScore>{hotel.rating.overall.toFixed(1)}</RatingScore>
              </RatingBox>
            )}
          </TitleRow>

          {hotel.location && (
            <InfoRow>
              <MapPin size={16} color={theme.colors.textMuted} />
              {hotel.location.address}
            </InfoRow>
          )}
          {hotel.phone && (
            <InfoRow>
              <Phone size={16} color={theme.colors.textMuted} />
              {hotel.phone}
            </InfoRow>
          )}

          {hotel.analytics && (
            <AnalyticsBox>
              {hotel.analytics.trend === 'down' && <TrendingDown size={20} color="#16a34a" />}
              {hotel.analytics.trend === 'up' && <TrendingUp size={20} color="#dc2626" />}
              {hotel.analytics.trend === 'stable' && <Minus size={20} color={theme.colors.textSecondary} />}
              <div>
                <span style={{ fontWeight: 500 }}>Price trend: </span>
                <span
                  style={{
                    color:
                      hotel.analytics.trend === 'down'
                        ? '#16a34a'
                        : hotel.analytics.trend === 'up'
                          ? '#dc2626'
                          : theme.colors.textSecondary,
                  }}
                >
                  {hotel.analytics.trend === 'down'
                    ? `${Math.abs(hotel.analytics.changePercentage || 0).toFixed(0)}% below average`
                    : hotel.analytics.trend === 'up'
                      ? `${hotel.analytics.changePercentage?.toFixed(0)}% above average`
                      : 'Stable'}
                </span>
              </div>
            </AnalyticsBox>
          )}
        </HeaderSection>

        {loading && (
          <Spinner>
            <SpinnerDot />
            Loading details...
          </Spinner>
        )}

        <TabBar>
          {tabs.map((tab) => (
            <Tab key={tab.id} $active={activeTab === tab.id} onClick={() => setActiveTab(tab.id)}>
              {tab.label}
            </Tab>
          ))}
        </TabBar>

        <TabContent>
          {activeTab === 'overview' && (
            <>
              {hotel.propertyDescription && <TextBlock>{hotel.propertyDescription}</TextBlock>}

              {hotel.location?.areaDescription && (
                <div>
                  <SectionTitle>Location</SectionTitle>
                  <TextBlock>{hotel.location.areaDescription}</TextBlock>
                </div>
              )}

              {hotel.insights && (
                <div>
                  <SectionTitle>Guest Insights</SectionTitle>
                  <TextBlock style={{ marginBottom: 12 }}>{hotel.insights.overall}</TextBlock>
                  <InsightGrid>
                    {hotel.insights.categories.map((cat) => (
                      <InsightCard key={cat.category}>
                        <InsightCategory>{cat.category}</InsightCategory>
                        <InsightTitle>{cat.title}</InsightTitle>
                        <InsightSummary>{cat.summary}</InsightSummary>
                      </InsightCard>
                    ))}
                  </InsightGrid>
                </div>
              )}

              {hotel.rating?.detailed && (
                <div>
                  <SectionTitle>Rating Breakdown</SectionTitle>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {Object.entries(hotel.rating.detailed).map(([key, value]) => (
                      <RatingBarRow key={key}>
                        <RatingBarLabel>{key}</RatingBarLabel>
                        <RatingBarTrack>
                          <RatingBarFill $pct={(value / 10) * 100} />
                        </RatingBarTrack>
                        <RatingBarValue>{value.toFixed(1)}</RatingBarValue>
                      </RatingBarRow>
                    ))}
                  </div>
                </div>
              )}

              {hotel.offers && hotel.offers.items.length > 0 && (
                <div>
                  <SectionTitle>
                    Available Offers ({hotel.offers.availableCount || hotel.offers.items.length})
                  </SectionTitle>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {hotel.offers.items.map((offer) => (
                      <OfferRow key={offer.id} offer={offer} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === 'rooms' &&
            (hotel.rooms && hotel.rooms.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {hotel.rooms.map((room) => (
                  <RoomCard key={room.id}>
                    {room.images && room.images.length > 0 && (
                      <RoomImage src={room.images[0]} alt={room.name} />
                    )}
                    <RoomContent>
                      <RoomName>{room.name}</RoomName>
                      {room.description && <TextBlock>{room.description}</TextBlock>}
                      <RoomMeta>
                        {room.maxOccupancy && <RoomMetaTag>Max {room.maxOccupancy} guests</RoomMetaTag>}
                        {room.area?.squareMeters && <RoomMetaTag>{room.area.squareMeters} m²</RoomMetaTag>}
                        {room.bedTypes?.map((b) => (
                          <RoomMetaTag key={b.id}>{b.name}</RoomMetaTag>
                        ))}
                      </RoomMeta>
                      {room.offers && room.offers.length > 0 && (
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                            paddingTop: 8,
                            borderTop: `1px solid ${theme.colors.background}`,
                          }}
                        >
                          {room.offers.map((offer) => (
                            <OfferRow key={offer.id} offer={offer} />
                          ))}
                        </div>
                      )}
                    </RoomContent>
                  </RoomCard>
                ))}
              </div>
            ) : (
              <EmptyText>Room details are not available for this hotel.</EmptyText>
            ))}

          {activeTab === 'reviews' &&
            (hotel.reviews && hotel.reviews.items.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {hotel.reviews.averageRating != null && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: 16,
                      background: theme.colors.background,
                      borderRadius: theme.borderRadius.md,
                    }}
                  >
                    <RatingScore style={{ width: 56, height: 56, fontSize: 20 }}>
                      {hotel.reviews.averageRating.toFixed(1)}
                    </RatingScore>
                    <div>
                      <div style={{ fontWeight: 500, color: theme.colors.textPrimary }}>Average rating</div>
                      <div style={{ fontSize: 13, color: theme.colors.textSecondary }}>
                        Based on {hotel.reviews.totalAvailable?.toLocaleString()} reviews
                      </div>
                    </div>
                  </div>
                )}
                {hotel.reviews.items.map((review, i) => (
                  <ReviewCard key={i}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <MessageSquare size={16} color={theme.colors.textMuted} />
                        <span style={{ fontWeight: 500, fontSize: 13, color: theme.colors.textPrimary }}>
                          {review.name || 'Anonymous'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {review.date && (
                          <span style={{ fontSize: 12, color: theme.colors.textMuted }}>{review.date}</span>
                        )}
                        {review.score != null && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Star size={14} fill="#fbbf24" color="#fbbf24" />
                            <span style={{ fontSize: 13, fontWeight: 500 }}>{review.score}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {review.text && <TextBlock>{review.text}</TextBlock>}
                    {review.source && (
                      <span style={{ fontSize: 12, color: theme.colors.textMuted }}>via {review.source}</span>
                    )}
                  </ReviewCard>
                ))}
              </div>
            ) : (
              <EmptyText>No reviews available.</EmptyText>
            ))}

          {activeTab === 'facilities' &&
            (hotel.facilities ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <FacilityGrid>
                  {hotel.facilities.items.map((f) => (
                    <FacilityChip key={f.id}>
                      {facilityIcon(f.name)}
                      {f.name}
                    </FacilityChip>
                  ))}
                </FacilityGrid>
                {hotel.facilities.amenities && (
                  <div>
                    <PolicyTitle>Amenities</PolicyTitle>
                    <TextBlock>{hotel.facilities.amenities}</TextBlock>
                  </div>
                )}
                {hotel.facilities.dining && (
                  <div>
                    <PolicyTitle>Dining</PolicyTitle>
                    <TextBlock>{hotel.facilities.dining}</TextBlock>
                  </div>
                )}
              </div>
            ) : (
              <EmptyText>Facilities information not available.</EmptyText>
            ))}

          {activeTab === 'faq' &&
            (hotel.faq && hotel.faq.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {hotel.faq.map((item, i) => (
                  <FaqItem key={i}>
                    <summary>
                      <HelpCircle size={16} color={theme.colors.primary} style={{ flexShrink: 0 }} />
                      {item.question}
                    </summary>
                    <FaqAnswer>{item.answer}</FaqAnswer>
                  </FaqItem>
                ))}
              </div>
            ) : (
              <EmptyText>No FAQs available.</EmptyText>
            ))}

          {activeTab === 'policies' &&
            (hotel.policies ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {hotel.policies.checkIn && (
                  <PolicyBlock>
                    <Clock size={20} color={theme.colors.textMuted} style={{ marginTop: 2 }} />
                    <div>
                      <PolicyTitle>Check-in</PolicyTitle>
                      <PolicyText>
                        {hotel.policies.checkIn.beginTime && `From ${hotel.policies.checkIn.beginTime}`}
                        {hotel.policies.checkIn.endTime && ` to ${hotel.policies.checkIn.endTime}`}
                        {hotel.policies.checkIn.minAge &&
                          ` · Minimum age: ${hotel.policies.checkIn.minAge}`}
                      </PolicyText>
                      {hotel.policies.checkIn.instructions && (
                        <PolicyText style={{ fontSize: 12, marginTop: 4 }}>
                          {hotel.policies.checkIn.instructions}
                        </PolicyText>
                      )}
                    </div>
                  </PolicyBlock>
                )}
                {hotel.policies.checkOut && (
                  <PolicyBlock>
                    <Clock size={20} color={theme.colors.textMuted} style={{ marginTop: 2 }} />
                    <div>
                      <PolicyTitle>Check-out</PolicyTitle>
                      <PolicyText>Before {hotel.policies.checkOut.time}</PolicyText>
                    </div>
                  </PolicyBlock>
                )}
                {hotel.policies.feesDescription && (
                  <PolicyBlock>
                    <Shield size={20} color={theme.colors.textMuted} style={{ marginTop: 2 }} />
                    <div>
                      <PolicyTitle>Fees</PolicyTitle>
                      <PolicyText>{hotel.policies.feesDescription}</PolicyText>
                    </div>
                  </PolicyBlock>
                )}
                {hotel.policies.knowBeforeYouGo && (
                  <WarningBox>
                    <PolicyTitle style={{ color: '#92400e', marginBottom: 4 }}>
                      Know before you go
                    </PolicyTitle>
                    <PolicyText style={{ color: '#b45309' }}>
                      {hotel.policies.knowBeforeYouGo}
                    </PolicyText>
                  </WarningBox>
                )}
                {hotel.policies.policiesDescription && (
                  <div>
                    <PolicyTitle>General Policies</PolicyTitle>
                    <PolicyText>{hotel.policies.policiesDescription}</PolicyText>
                  </div>
                )}
              </div>
            ) : (
              <EmptyText>Policy information not available.</EmptyText>
            ))}
        </TabContent>
      </Panel>
    </Overlay>
  );
};

export default VioHotelDetail;
