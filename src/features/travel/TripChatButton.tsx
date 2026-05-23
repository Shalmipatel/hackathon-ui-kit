import React, { useCallback, useState } from 'react';
import styled from 'styled-components';
import { useSendMessage } from '@/features/chat/useSendMessage';
import { selectActiveTrip, selectBookingsForTrip, useTravelStore } from './travel-store';
import { formatTripRange, formatDayLabel, formatTimeOfDay } from './format';

const Composer = styled.form`
  display: flex;
  gap: 8px;
  padding: 10px 10px 10px 14px;
  border-radius: 14px;
  background: #fff;
  border: 1px solid rgba(36, 36, 36, 0.1);
  font-family: 'Inter', sans-serif;
`;

const Input = styled.input`
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-family: inherit;
  font-size: 13.5px;
  color: #242424;

  &::placeholder {
    color: rgba(36, 36, 36, 0.4);
  }
`;

const Send = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 10px;
  background: #242424;
  color: #fff;
  cursor: pointer;
  flex-shrink: 0;
  transition: transform 0.12s;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
  }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const QuickRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
`;

const Quick = styled.button`
  border: 1px solid rgba(36, 36, 36, 0.15);
  background: rgba(255, 255, 255, 0.6);
  color: rgba(36, 36, 36, 0.85);
  font-family: 'Inter', sans-serif;
  font-size: 11.5px;
  font-weight: 500;
  padding: 5px 10px;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.12s;

  &:hover {
    background: #fff;
    border-color: rgba(36, 36, 36, 0.3);
  }
`;

/** Build a compact, human-readable summary of the trip the assistant can use. */
function buildTripContext(): string | null {
  const state = useTravelStore.getState();
  const trip = selectActiveTrip(state);
  if (!trip) return null;
  const bookings = selectBookingsForTrip(state, trip.id);
  const lines: string[] = [];
  lines.push(`Trip: ${trip.title} — ${trip.destination}`);
  lines.push(`Dates: ${formatTripRange(trip)}`);
  if (trip.travelers && trip.travelers.length > 0) {
    lines.push(`Travelers: ${trip.travelers.join(', ')}`);
  }
  if (bookings.length === 0) {
    lines.push('No bookings yet.');
  } else {
    lines.push('Bookings:');
    bookings.forEach((b) => {
      const when = `${formatDayLabel(b.start.slice(0, 10))} ${formatTimeOfDay(b.start)}`;
      lines.push(`- [${b.type}] ${b.title} (${when})${b.confirmation ? ` · ${b.confirmation}` : ''}`);
    });
  }
  return lines.join('\n');
}

interface TripChatButtonProps {
  onNavigateToChat: () => void;
}

export const TripChatButton: React.FC<TripChatButtonProps> = ({ onNavigateToChat }) => {
  const sendMessage = useSendMessage();
  const [text, setText] = useState('');
  const trip = useTravelStore(selectActiveTrip);

  const send = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;
      const ctx = buildTripContext();
      const composed = ctx
        ? `Context — my current trip:\n${ctx}\n\nMy question: ${trimmed}`
        : trimmed;
      sendMessage(composed);
      setText('');
      onNavigateToChat();
    },
    [onNavigateToChat, sendMessage],
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send(text);
  };

  return (
    <div>
      <Composer onSubmit={onSubmit}>
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            trip
              ? `Ask about ${trip.title.split(' ')[0]}…`
              : 'Ask the planner anything…'
          }
        />
        <Send type="submit" disabled={!text.trim()} aria-label="Send">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </Send>
      </Composer>
      {trip && (
        <QuickRow>
          <Quick type="button" onClick={() => send('What does day 1 of my trip look like? Any conflicts?')}>
            Day 1 plan
          </Quick>
          <Quick type="button" onClick={() => send('Suggest 3 dinner options near my hotel for the first night.')}>
            Dinner ideas
          </Quick>
          <Quick type="button" onClick={() => send('Check my Gmail for any booking confirmations I haven\'t added to this trip yet, and propose adds.')}>
            Scan inbox
          </Quick>
        </QuickRow>
      )}
    </div>
  );
};

export default TripChatButton;
