import type { Trip, Booking } from './types';

/* Start empty — trips come from scanning the user's connections. The
   demo Tokyo + Lisbon trips that used to live here were getting
   re-introduced every time localStorage was cleared and looked like
   the app shipped with mystery data. */

export const MOCK_TRIPS: Trip[] = [];

export const MOCK_BOOKINGS: Booking[] = [];
