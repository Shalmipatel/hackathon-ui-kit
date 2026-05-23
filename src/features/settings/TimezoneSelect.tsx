import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import styled from 'styled-components';
import { theme } from '@/components/theme';
import { EVENTS, track } from '@/features/analytics';

function getSystemTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function formatTimezoneName(tz: string): string {
  return tz.replace(/_/g, ' ');
}

function getUtcOffset(tz: string): string {
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    }).formatToParts(now);
    const offsetPart = parts.find((p) => p.type === 'timeZoneName');
    return offsetPart?.value ?? '';
  } catch {
    return '';
  }
}

const ALL_TIMEZONES: string[] = Intl.supportedValuesOf('timeZone');

/* ── Styled Components ── */

const Wrapper = styled.div`
  position: relative;
`;

const Trigger = styled.button<{ $open: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: 1px solid ${(p) => (p.$open ? 'rgba(36, 36, 36, 0.4)' : 'rgba(36, 36, 36, 0.2)')};
  border-radius: 12px;
  background: white;
  font-size: 14px;
  font-family: 'Inter', ${theme.fontFamily};
  color: #242424;
  cursor: pointer;
  outline: none;
  min-width: 220px;
  max-width: 280px;
  text-align: left;
  transition: border-color 0.15s;
  @media (max-width: 640px) {
    min-width: 0;
    max-width: none;
    width: 100%;
  }

  &:hover {
    border-color: rgba(36, 36, 36, 0.4);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const TriggerText = styled.span`
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const TriggerOffset = styled.span`
  font-size: 12px;
  color: rgba(36, 36, 36, 0.5);
  flex-shrink: 0;
`;

const ChevronIcon = styled.span<{ $open: boolean }>`
  display: flex;
  align-items: center;
  flex-shrink: 0;
  color: rgba(36, 36, 36, 0.5);
  transition: transform 0.15s;
  transform: ${(p) => (p.$open ? 'rotate(180deg)' : 'rotate(0deg)')};
`;

const Dropdown = styled.div`
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 1000;
  background: white;
  border: 1px solid rgba(36, 36, 36, 0.1);
  border-radius: 16px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
  width: 300px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  @media (max-width: 640px) {
    width: 100%;
  }
`;

const SearchWrapper = styled.div`
  padding: 10px 12px 8px;
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid rgba(36, 36, 36, 0.1);
  border-radius: 10px;
  background: rgba(36, 36, 36, 0.03);
  color: #242424;
  font-size: 13px;
  font-family: 'Inter', ${theme.fontFamily};
  outline: none;
  box-sizing: border-box;

  &::placeholder {
    color: rgba(36, 36, 36, 0.35);
  }

  &:focus {
    border-color: rgba(36, 36, 36, 0.25);
    background: white;
  }
`;

const OptionsList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 6px;
  max-height: 160px;
  overflow-y: auto;
`;

const OptionItem = styled.li<{ $selected: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  background: ${(p) => (p.$selected ? 'rgba(36, 36, 36, 0.05)' : 'transparent')};
  transition: background 0.1s;

  &:hover {
    background: rgba(36, 36, 36, 0.05);
  }
`;

const OptionName = styled.span`
  font-size: 13px;
  font-family: 'Inter', ${theme.fontFamily};
  color: #242424;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const OptionOffset = styled.span`
  font-size: 12px;
  font-family: 'Inter', ${theme.fontFamily};
  color: rgba(36, 36, 36, 0.45);
  flex-shrink: 0;
`;

const SelectedCheck = styled.span`
  display: flex;
  align-items: center;
  color: #22c55e;
  flex-shrink: 0;
`;

const NoResults = styled.li`
  padding: 14px;
  font-size: 13px;
  font-family: 'Inter', ${theme.fontFamily};
  color: rgba(36, 36, 36, 0.45);
  text-align: center;
`;

/* ── Component ── */

interface TimezoneSelectProps {
  value: string;
  onChange: (timezone: string) => void;
  disabled?: boolean;
}

export const TimezoneSelect: React.FC<TimezoneSelectProps> = ({ value, onChange, disabled }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const filteredTimezones = useMemo(() => {
    const q = search.toLowerCase().replace(/\s+/g, '_');
    if (!q) return ALL_TIMEZONES;
    return ALL_TIMEZONES.filter((tz) => tz.toLowerCase().includes(q));
  }, [search]);

  useEffect(() => {
    const trimmed = search.trim();
    if (trimmed.length === 0) return;
    const handle = setTimeout(() => {
      track(EVENTS.SEARCH_PERFORMED, {
        surface: 'settings',
        query_length: trimmed.length,
        result_count: filteredTimezones.length,
      });
    }, 400);
    return () => clearTimeout(handle);
  }, [search, filteredTimezones.length]);

  const handleOpen = useCallback(() => {
    if (disabled) return;
    setOpen((prev) => !prev);
  }, [disabled]);

  const handleSelect = useCallback(
    (tz: string) => {
      onChange(tz);
      setOpen(false);
      setSearch('');
    },
    [onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setSearch('');
      }
    },
    [],
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Auto-focus the search input when dropdown opens
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open]);

  const offset = getUtcOffset(value);

  return (
    <Wrapper ref={wrapperRef} onKeyDown={handleKeyDown}>
      <Trigger $open={open} onClick={handleOpen} disabled={disabled} type="button">
        <TriggerText>{formatTimezoneName(value)}</TriggerText>
        {offset && <TriggerOffset>{offset}</TriggerOffset>}
        <ChevronIcon $open={open}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </ChevronIcon>
      </Trigger>

      {open && (
        <Dropdown>
          <SearchWrapper>
            <SearchInput
              ref={searchRef}
              placeholder="Search timezones…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </SearchWrapper>
          <OptionsList>
            {filteredTimezones.length === 0 ? (
              <NoResults>No timezones found</NoResults>
            ) : (
              filteredTimezones.map((tz) => (
                <OptionItem
                  key={tz}
                  $selected={tz === value}
                  onClick={() => handleSelect(tz)}
                >
                  <OptionName title={tz}>{formatTimezoneName(tz)}</OptionName>
                  <OptionOffset>{getUtcOffset(tz)}</OptionOffset>
                  {tz === value && (
                    <SelectedCheck>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </SelectedCheck>
                  )}
                </OptionItem>
              ))
            )}
          </OptionsList>
        </Dropdown>
      )}
    </Wrapper>
  );
};

export { getSystemTimezone };
