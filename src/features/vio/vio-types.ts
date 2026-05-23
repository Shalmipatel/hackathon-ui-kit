export interface RoomConfig {
  adults: number;
  children?: number[];
}

export interface Rate {
  base: number;
  taxes: number;
  hotelFees: number;
  displayPrice: number;
}

export interface Offer {
  id: string;
  url: string;
  currency: string;
  rate: Rate;
  cancellationPenalties?: {
    amount: number;
    currency: string;
    start: string;
    end: string;
  }[];
  package?: { amenities: string[] };
  providerCode: string;
  providerName: string;
  roomName?: string;
  roomId?: string;
  tags?: string[];
  availableRooms?: number | null;
}

export interface Hotel {
  id: string;
  name: string;
  url: string;
  propertyDescription?: string;
  roomsDescription?: string;
  phone?: string;
  typicalPriceRange?: { min: number; max: number };
  isPartialMatch?: boolean;
  location?: {
    address: string;
    displayName: string;
    latitude: number | null;
    longitude: number | null;
    timezone?: string;
    areaDescription?: string;
    attractionsDescription?: string;
    nearbyAttractions?: {
      name: string;
      distanceKm: number;
      distanceMiles: number;
    }[];
  };
  rating?: {
    overall: number;
    reviewCount: number | null;
    guestType?: Record<string, number>;
    detailed?: Record<string, number>;
  };
  classification?: {
    starRating: number | null;
    propertyType?: { id: string; name: string };
    themes?: { id: string; name: string }[];
    sentiments?: { id: string; name: string }[];
  };
  facilities?: {
    items: { id: string; name: string }[];
    amenities?: string;
    dining?: string;
  };
  media?: {
    images: string[];
    imagesAvailable: number;
  };
  offers?: {
    items: Offer[];
    availableCount?: number;
    cheapestRate?: Rate;
  };
  rooms?: {
    id: string;
    name: string;
    description?: string;
    maxOccupancy?: number;
    amenities?: string[];
    bedTypes?: { id: string; name: string }[];
    images?: string[];
    area?: { squareMeters?: number; squareFeet?: number };
    offers?: Offer[];
  }[];
  reviews?: {
    totalAvailable?: number;
    averageRating?: number | null;
    items: {
      date?: string;
      name?: string;
      score?: number;
      text?: string;
      source?: string;
    }[];
  };
  insights?: {
    overall: string;
    categories: { category: string; title: string; summary: string }[];
  };
  policies?: {
    checkIn?: {
      beginTime?: string;
      endTime?: string;
      minAge?: number;
      instructions?: string;
    };
    checkOut?: { time?: string };
    feesDescription?: string;
    policiesDescription?: string;
    knowBeforeYouGo?: string;
  };
  faq?: { question: string; answer: string; label?: string }[];
  analytics?: {
    averagePrice?: number;
    trend?: 'up' | 'down' | 'stable';
    changePercentage?: number;
    comparisonToSimilar?: {
      differencePercentage: number;
      assessment: 'cheaper' | 'same' | 'expensive';
    };
  };
}

export interface VioSearchResponse {
  include?: string[];
  language?: string;
  currency?: string;
  checkIn?: string;
  checkOut?: string;
  nights?: number;
  roomConfiguration?: RoomConfig[];
  priceScope?: string;
  priceLogic?: string;
  hotels?: Hotel[];
  totalResults?: number;
  hasMoreResults?: boolean;
  nextOffsets?: number[];
  placeDisplayName?: string;
  queries?: string[];
  error?: string;
}
