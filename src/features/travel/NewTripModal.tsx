/**
 * Lightweight new-trip modal. On submit it: (1) creates the trip in
 * the travel store, (2) creates the trip's dedicated chat session
 * up-front so the chatSessionId is on the Trip from the moment the
 * trip exists — that's the "create chat when trip is created" the
 * spec asks for.
 *
 * Same isAiTitled flip pattern as TripChatPanel.ensureTripChatSession:
 * createSession with a deterministic id → chatRepo.updateTitle → the
 * sync paths skip it.
 */

import React, { useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { getChatStore } from '@/features/app/bootstrap';
import { getChatRepo } from '@/features/app/bootstrap/providers';
import { useTravelStore } from './travel-store';
import type { Trip } from './types';

const TRIP_COLORS = ['#feeb29', '#22c55e', '#38bdf8', '#a855f7', '#f87171', '#fb923c'];

const fadeIn = keyframes`
  from { opacity: 0; }
  to   { opacity: 1; }
`;

const slideUp = keyframes`
  from { opacity: 0; transform: translateY(8px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
`;

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(36, 36, 36, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: ${fadeIn} 0.18s ease-out;
  padding: 24px;
`;

const Card = styled.form`
  background: #fff;
  border-radius: 18px;
  width: min(440px, 100%);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  font-family: 'Inter', sans-serif;
  box-shadow: 0 24px 60px rgba(36, 36, 36, 0.35);
  animation: ${slideUp} 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
`;

const Head = styled.div`
  padding: 20px 24px 14px;
  border-bottom: 1px solid rgba(36, 36, 36, 0.06);
`;

const Title = styled.h2`
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #242424;
  letter-spacing: -0.3px;
`;

const Sub = styled.div`
  font-size: 12.5px;
  color: rgba(36, 36, 36, 0.6);
  margin-top: 4px;
`;

const Body = styled.div`
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: rgba(36, 36, 36, 0.6);
  font-weight: 500;
  letter-spacing: -0.2px;
`;

const Input = styled.input`
  font-family: inherit;
  font-size: 14px;
  color: #242424;
  padding: 9px 12px;
  border: 1px solid rgba(36, 36, 36, 0.15);
  border-radius: 10px;
  background: #fff;
  transition: border-color 0.12s;

  &:focus {
    outline: none;
    border-color: rgba(36, 36, 36, 0.5);
  }
`;

const DateRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
`;

const ColorRow = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 2px;
`;

const Swatch = styled.button<{ $color: string; $selected: boolean }>`
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 2px solid ${(p) => (p.$selected ? '#242424' : 'transparent')};
  background: ${(p) => p.$color};
  cursor: pointer;
  transition: transform 0.12s;
  padding: 0;

  &:hover {
    transform: translateY(-1px);
  }
`;

const Footer = styled.div`
  padding: 14px 24px;
  border-top: 1px solid rgba(36, 36, 36, 0.06);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
`;

const Btn = styled.button<{ $variant?: 'primary' }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid
    ${(p) => (p.$variant === 'primary' ? '#242424' : 'rgba(36, 36, 36, 0.18)')};
  background: ${(p) => (p.$variant === 'primary' ? '#242424' : 'transparent')};
  color: ${(p) => (p.$variant === 'primary' ? '#fff' : '#242424')};
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  font-size: 13px;
  padding: 9px 16px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.12s;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`;

const ErrorText = styled.div`
  color: #dc2626;
  font-size: 12px;
  margin-top: 4px;
`;

function todayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function makeId(title: string): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'trip';
  return `trip-${slug}-${Date.now().toString(36)}`;
}

interface NewTripModalProps {
  onClose: () => void;
}

export const NewTripModal: React.FC<NewTripModalProps> = ({ onClose }) => {
  const addTrip = useTravelStore((s) => s.addTrip);
  const updateTrip = useTravelStore((s) => s.updateTrip);

  const [title, setTitle] = useState('');
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState(todayPlus(14));
  const [endDate, setEndDate] = useState(todayPlus(20));
  const [color, setColor] = useState(TRIP_COLORS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid =
    title.trim().length > 0 &&
    destination.trim().length > 0 &&
    !!startDate &&
    !!endDate &&
    startDate <= endDate;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);

    const tripId = makeId(title);
    const trip: Trip = {
      id: tripId,
      title: title.trim(),
      destination: destination.trim(),
      startDate,
      endDate,
      color,
    };

    /* Create the chat session up-front so the trip is born with its
       chatSessionId attached. Same isAiTitled-flip pattern as
       TripChatPanel.ensureTripChatSession — keeps the session out of
       sync/retitle loops. */
    const sessionId = `trip-${tripId}`;
    try {
      const chat = getChatStore();
      await chat.getState().createSession(sessionId);
      await getChatRepo().updateTitle(sessionId, trip.title);
      await chat.getState().refreshSessions();
      trip.chatSessionId = sessionId;
    } catch (err) {
      console.warn('[new-trip] session create failed (proceeding without)', err);
    }

    addTrip(trip);
    /* If session creation failed addTrip ran without chatSessionId;
       updateTrip is a no-op fast path in that case. */
    if (trip.chatSessionId) {
      updateTrip(tripId, { chatSessionId: trip.chatSessionId });
    }
    setSubmitting(false);
    onClose();
  }

  return (
    <Backdrop
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <Card onSubmit={onSubmit}>
        <Head>
          <Title>New trip</Title>
          <Sub>Add a trip to your board — its chat starts fresh.</Sub>
        </Head>
        <Body>
          <Field>
            Trip name
            <Input
              autoFocus
              placeholder="e.g. Tokyo + Kyoto"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field>
            Destination
            <Input
              placeholder="e.g. Japan"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            />
          </Field>
          <DateRow>
            <Field>
              Start
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            <Field>
              End
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
          </DateRow>
          <Field>
            Accent color
            <ColorRow>
              {TRIP_COLORS.map((c) => (
                <Swatch
                  key={c}
                  type="button"
                  $color={c}
                  $selected={c === color}
                  onClick={() => setColor(c)}
                  aria-label={`Color ${c}`}
                />
              ))}
            </ColorRow>
          </Field>
          {error && <ErrorText>{error}</ErrorText>}
        </Body>
        <Footer>
          <Btn type="button" onClick={onClose}>Cancel</Btn>
          <Btn type="submit" $variant="primary" disabled={!valid || submitting}>
            {submitting ? 'Creating…' : 'Create trip'}
          </Btn>
        </Footer>
      </Card>
    </Backdrop>
  );
};

export default NewTripModal;
