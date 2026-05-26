# Wanderbot — SwiftUI port

A native iOS port of the React mobile shell (`src/features/mobile/MobileApp.tsx`)
using SwiftUI + MapKit. The mobile UX is preserved verbatim — top bar,
paged trip carousel, sticky map header, day-grouped itinerary, chat
sheet, settings action sheet, booking detail sheet — but the
implementation uses only native components (no UIKit, no WebView).

## Open & run

```bash
open ios/Wanderbot/Wanderbot.xcodeproj
```

Pick any iOS Simulator and hit ⌘R. iOS 17+ is required (MapKit's
SwiftUI APIs).

Or build/install from the command line:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -project ios/Wanderbot/Wanderbot.xcodeproj \
  -scheme Wanderbot \
  -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  build
```

## What's in scope

| Web feature | Swift implementation |
| --- | --- |
| Horizontal trip pager with scroll-snap | `TabView(.page)` paging in `TripPagerView.swift` |
| Sticky map header per trip | `pinnedViews: [.sectionHeaders]` over a `Map` in `TripPageView.swift` |
| Map markers per booking, focus follows scroll | MapKit `Annotation` with camera updates in `TripMapView.swift` |
| Itinerary day groups + booking cards | `ItineraryView.swift` + `BookingCardView.swift` |
| Bottom-sheet booking detail | `.sheet { … }.presentationDetents([.medium, .large])` in `BookingDetailSheet.swift` |
| Chat FAB → bottom-sheet chat | `ChatSheet.swift` with `.large` detent |
| Settings action sheet | `.confirmationDialog` |
| Connections / Settings overlays | `.fullScreenCover` + `NavigationStack` |
| "Past trip" pill | `PastTripBadge` in `ItineraryView.swift` |
| Brand: yellow paper-plane + "Wanderbot" | `TopBarView.swift` |

## Real data

The iOS app reads from the same Firebase Realtime Database the web
app does. Connection settings live in
[`Model/Config.swift`](Wanderbot/Wanderbot/Model/Config.swift) —
swap the database URL there for your own RTDB instance.

Boot flow ([`TravelStore.bootstrap`](Wanderbot/Wanderbot/Model/TravelStore.swift)):
1. REST `GET /wanderbot/trips.json` + `/wanderbot/bookings.json` for an
   immediate snapshot.
2. Open SSE streams on the same endpoints (`Accept: text/event-stream`)
   for live updates — handles `put` / `patch` events at both root and
   per-id paths, just like the web app's `onValue` subscription.
3. Each snapshot is applied to the `@Published` trips/bookings; the
   UI rerenders automatically.

When `Config.firebaseDatabaseURL` is empty the app falls back to the
bundled `SampleData` so development without RTDB still works.

## What's out of scope

Bookings flow into RTDB from the web app's chat ingestion path. The
iOS app **mirrors** them but doesn't yet write back — no inline editing,
no booking creation, no `PUT` / `DELETE` round-trip. Add those when
you need them; the seam is at the bottom of `FirebaseRTDB.swift`.

The chat sheet ([`ChatSheet.swift`](Wanderbot/Wanderbot/Views/ChatSheet.swift))
produces canned local replies and does not call the OpenClaw Responses
API. Plug a real transport into its `send()` method.

Gmail OAuth is also not ported — `ConnectionsView` shows the source
list as a static UI placeholder.

## Layout

```
ios/Wanderbot/
├── Wanderbot.xcodeproj/
└── Wanderbot/
    ├── WanderbotApp.swift        # @main, wires TravelStore
    ├── RootView.swift            # mobile shell — pager, FAB, sheets
    ├── Theme.swift               # colors + fonts
    ├── Model/
    │   ├── Models.swift          # Trip, Booking, Place, etc.
    │   ├── TravelStore.swift     # ObservableObject mirror of zustand store
    │   ├── SampleData.swift      # 3 seed trips (Tokyo, Lisbon, NYC past)
    │   ├── BookingType+UI.swift  # SF Symbol + accent color per type
    │   └── DateFormatters.swift  # shared date / money formatters
    └── Views/
        ├── TopBarView.swift
        ├── TripPagerView.swift
        ├── TripPageView.swift
        ├── TripMapView.swift
        ├── ItineraryView.swift
        ├── BookingCardView.swift
        ├── BookingDetailSheet.swift
        ├── ChatSheet.swift
        ├── SettingsSheet.swift   # placeholder — see RootView for action sheet
        ├── ConnectionsView.swift
        └── SettingsView.swift
```
