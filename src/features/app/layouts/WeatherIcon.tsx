import React from 'react';

interface WeatherIconProps {
  code?: number;
  description?: string;
  size?: number;
  color?: string;
}

type WeatherIconKind =
  | 'clear-day'
  | 'clear-night'
  | 'partly-cloudy-day'
  | 'partly-cloudy-night'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'thunderstorm'
  | 'unknown';

function isNightNow(): boolean {
  const hour = new Date().getHours();
  return hour < 6 || hour >= 20;
}

function getIconKind(code: number | undefined): WeatherIconKind {
  const night = isNightNow();
  if (code === 0) return night ? 'clear-night' : 'clear-day';
  if (code === 1 || code === 2) return night ? 'partly-cloudy-night' : 'partly-cloudy-day';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code === 51 || code === 53 || code === 55) return 'drizzle';
  if (code === 61 || code === 63 || code === 65 || code === 66 || code === 67 || code === 80 || code === 81) return 'rain';
  if (code === 71 || code === 73 || code === 75 || code === 77 || code === 85 || code === 86) return 'snow';
  if (code === 82 || code === 95 || code === 96 || code === 99) return 'thunderstorm';
  return 'unknown';
}

function SvgWrap({
  size,
  children,
  description,
}: {
  size: number;
  children: React.ReactNode;
  description: string;
}): React.ReactElement {
  return (
    <span role="img" aria-label={description} title={description} style={{ display: 'inline-flex', lineHeight: 0 }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {children}
      </svg>
    </span>
  );
}

const WeatherIcon: React.FC<WeatherIconProps> = ({ code, description = 'Weather', size = 20, color = '#242424' }) => {
  const stroke = { stroke: color, strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const kind = getIconKind(code);

  if (kind === 'clear-day') {
    return (
      <SvgWrap size={size} description={description}>
        <circle cx="12" cy="12" r="3.5" {...stroke} />
        <path d="M12 2.5V5M12 19V21.5M4.9 4.9L6.7 6.7M17.3 17.3L19.1 19.1M2.5 12H5M19 12H21.5M4.9 19.1L6.7 17.3M17.3 6.7L19.1 4.9" {...stroke} />
      </SvgWrap>
    );
  }

  if (kind === 'clear-night') {
    return (
      <SvgWrap size={size} description={description}>
        <path d="M15.6 3.2a8.2 8.2 0 1 0 5.2 12.9A7.1 7.1 0 1 1 15.6 3.2Z" {...stroke} />
      </SvgWrap>
    );
  }

  if (kind === 'partly-cloudy-day') {
    return (
      <SvgWrap size={size} description={description}>
        <circle cx="9" cy="8" r="2.7" {...stroke} />
        <path d="M9 3.1V4.6M5.5 4.8L6.6 5.9M3.9 8H5.4M12.5 8H14M5.5 11.2L6.6 10.1" {...stroke} />
        <path d="M7 17.5h9.5a3 3 0 0 0 0-6 4.2 4.2 0 0 0-8.1 1.3A2.6 2.6 0 0 0 7 17.5Z" {...stroke} />
      </SvgWrap>
    );
  }

  if (kind === 'partly-cloudy-night') {
    return (
      <SvgWrap size={size} description={description}>
        <path d="M11.3 4.2A4 4 0 0 0 14 8a4.5 4.5 0 0 1-3.8.5 3.8 3.8 0 0 1 1.1-4.3Z" {...stroke} />
        <path d="M7 17.5h9.5a3 3 0 0 0 0-6 4.2 4.2 0 0 0-8.1 1.3A2.6 2.6 0 0 0 7 17.5Z" {...stroke} />
      </SvgWrap>
    );
  }

  if (kind === 'cloudy') {
    return (
      <SvgWrap size={size} description={description}>
        <path d="M6 17h11.2a3.3 3.3 0 0 0 0-6.6 5 5 0 0 0-9.7 1.6A3 3 0 0 0 6 17Z" {...stroke} />
      </SvgWrap>
    );
  }

  if (kind === 'fog') {
    return (
      <SvgWrap size={size} description={description}>
        <path d="M6 12.3h10.8a2.9 2.9 0 0 0 0-5.8 4.5 4.5 0 0 0-8.6 1.5A2.5 2.5 0 0 0 6 12.3Z" {...stroke} />
        <path d="M4 15h16M6 18h12" {...stroke} />
      </SvgWrap>
    );
  }

  if (kind === 'drizzle') {
    return (
      <SvgWrap size={size} description={description}>
        <path d="M6 12.5h11a3 3 0 0 0 0-6 4.5 4.5 0 0 0-8.8 1.5A2.6 2.6 0 0 0 6 12.5Z" {...stroke} />
        <path d="M8.5 15.5v1.7M12 15.8v1.7M15.5 15.5v1.7" {...stroke} />
      </SvgWrap>
    );
  }

  if (kind === 'rain') {
    return (
      <SvgWrap size={size} description={description}>
        <path d="M6 12.5h11a3 3 0 0 0 0-6 4.5 4.5 0 0 0-8.8 1.5A2.6 2.6 0 0 0 6 12.5Z" {...stroke} />
        <path d="M8.3 15.6 7.7 18M12 15.6 11.4 18M15.7 15.6 15.1 18" {...stroke} />
      </SvgWrap>
    );
  }

  if (kind === 'snow') {
    return (
      <SvgWrap size={size} description={description}>
        <path d="M6 12.5h11a3 3 0 0 0 0-6 4.5 4.5 0 0 0-8.8 1.5A2.6 2.6 0 0 0 6 12.5Z" {...stroke} />
        <path d="M8.5 16.4h0M12 16.9h0M15.5 16.4h0" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
      </SvgWrap>
    );
  }

  if (kind === 'thunderstorm') {
    return (
      <SvgWrap size={size} description={description}>
        <path d="M6 12.5h11a3 3 0 0 0 0-6 4.5 4.5 0 0 0-8.8 1.5A2.6 2.6 0 0 0 6 12.5Z" {...stroke} />
        <path d="m11 14.2-1.2 2.6h1.5l-1.1 2.2 3-3.6h-1.5l1.1-1.2" {...stroke} />
      </SvgWrap>
    );
  }

  return (
    <SvgWrap size={size} description={description}>
      <circle cx="12" cy="12" r="8" {...stroke} />
      <path d="M12 8.5v4.2M12 16h0" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </SvgWrap>
  );
};

export default WeatherIcon;
