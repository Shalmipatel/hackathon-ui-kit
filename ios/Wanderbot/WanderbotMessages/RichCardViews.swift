import SwiftUI
import MapKit

// Premium trip cards for the iMessage extension — "the og card, alive."
// The compact bubble is a miniature of the brand's night-scene card; the
// expanded viewer is a living version: seeded starfield hero unique to each
// trip, cream paper sheet, ink typography, yellow rationed to four brand
// moments (live countdown, next-up time, CTA glyph, next-up map pin).
// All colors pinned — no system semantic colors anywhere.

// MARK: - Paper tokens + shared style

enum WB {
    static let cream = Color(red: 0xFB / 255, green: 0xFA / 255, blue: 0xF9 / 255)
    static let panelCream = Color(red: 0xF7 / 255, green: 0xF1 / 255, blue: 0xE6 / 255)
    static let surface = Color.white
    static let ink = Color(red: 0x1F / 255, green: 0x24 / 255, blue: 0x21 / 255)
    static let yellow = Color(red: 0xFE / 255, green: 0xEB / 255, blue: 0x29 / 255)

    /// Muted, editorial booking-type colors (fills at 0.14, glyphs full).
    /// Hotel is warm taupe, NOT yellow — yellow stays rationed to the four
    /// brand moments (live countdown, next-up time, CTA glyph, next-up pin).
    static func typeColor(_ type: BookingType) -> Color {
        switch type {
        case .flight:                           return Color(red: 0x5B / 255, green: 0x87 / 255, blue: 0xA6 / 255)
        case .hotel:                            return Color(red: 0x8A / 255, green: 0x73 / 255, blue: 0x50 / 255)
        case .restaurant:                       return Color(red: 0xC2 / 255, green: 0x6A / 255, blue: 0x45 / 255)
        case .attraction, .experience, .event:  return Color(red: 0x7E / 255, green: 0x6A / 255, blue: 0xA6 / 255)
        case .activity, .transport:             return Color(red: 0x4E / 255, green: 0x8A / 255, blue: 0x68 / 255)
        }
    }

    /// Type symbol, corrected per booking — a car rental must not render a
    /// train just because its type is `transport`.
    static func symbol(for booking: Booking) -> String {
        if booking.type == .transport {
            let haystack = [booking.mode, booking.title, booking.provider]
                .compactMap { $0?.lowercased() }.joined(separator: " ")
            let carWords = ["car", "rental", "auto", "avis", "hertz", "sixt", "europcar", "drive", "suv"]
            if carWords.contains(where: haystack.contains) { return "car.fill" }
            if haystack.contains("ferry") || haystack.contains("boat") { return "ferry.fill" }
            if haystack.contains("bus") { return "bus.fill" }
        }
        return booking.type.sfSymbol
    }

    /// Hero/compact eyebrow: the locale line above the title. Suppressed when
    /// it just repeats the title; a ", <title>" country suffix is stripped
    /// ("SAN MARCOS LA LAGUNA, GUATEMALA" over "Guatemala" → "SAN MARCOS LA
    /// LAGUNA") so the two lines never say the same thing twice.
    static func eyebrow(for trip: Trip) -> String? {
        let destination = trip.destination.trimmingCharacters(in: .whitespaces)
        guard !destination.isEmpty else { return nil }
        if destination.caseInsensitiveCompare(trip.title) == .orderedSame { return nil }
        let suffix = ", \(trip.title)"
        if destination.lowercased().hasSuffix(suffix.lowercased()) {
            let stripped = String(destination.dropLast(suffix.count)).trimmingCharacters(in: .whitespaces)
            return stripped.isEmpty ? nil : stripped
        }
        return destination
    }
}

/// True when a meta/subtitle line is redundant with its title — an exact
/// duplicate, a prefix ("Avis" under "Avis Autovermietung…"), or a
/// same-words variant ("Eterna – Lakeview Escape…" under "Eterna • Romantic
/// Lakeview Escape…"). Rendering those reads as a template bug, not info.
func wbRedundant(_ title: String, _ meta: String) -> Bool {
    func tokens(_ s: String) -> Set<String> {
        Set(s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { $0.count > 1 })
    }
    let a = tokens(title), b = tokens(meta)
    guard !a.isEmpty, !b.isEmpty else { return true }
    let overlap = Double(a.intersection(b).count) / Double(min(a.count, b.count))
    return overlap >= 0.6
}

extension WB {
    /// Trip accent as RGB for sky weaving.
    static func accentRGB(_ trip: Trip?) -> WBRGB? {
        guard let hex = trip?.color else { return nil }
        return WBRGB(hexString: hex)
    }

    /// "In 12 days" / "Day 2 of 5" / "Completed" status for a trip.
    static func countdown(_ trip: Trip) -> (text: String, live: Bool) {
        let cal = Calendar.current
        let today = cal.startOfDay(for: Date())
        guard let start = trip.startDateValue, let end = trip.endDateValue else { return ("", false) }
        if today < start {
            let days = cal.dateComponents([.day], from: today, to: start).day ?? 0
            if days == 0 { return ("Starts today", true) }
            if days == 1 { return ("Tomorrow", true) }
            return ("In \(days) days", false)
        }
        if today > end { return ("Completed", false) }
        let dayNum = (cal.dateComponents([.day], from: start, to: today).day ?? 0) + 1
        return ("Day \(dayNum) of \(trip.dayCount)", true)
    }
}

/// Global press response: slight scale + softened shadow.
struct WBPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.965 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

private extension View {
    /// White/cream card recipe: continuous radius + hairline + soft shadow.
    /// (Shadow alone reads cheap — the hairline is what makes it crisp.)
    func wbCard(radius: CGFloat = 14, fill: Color = WB.surface) -> some View {
        background(RoundedRectangle(cornerRadius: radius, style: .continuous).fill(fill))
            .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous)
                .strokeBorder(WB.ink.opacity(0.08), lineWidth: 1))
            .shadow(color: WB.ink.opacity(0.07), radius: 10, y: 3)
    }

    func wbSectionLabel() -> some View {
        font(.system(size: 11, weight: .heavy))
            .tracking(1.6)
            .textCase(.uppercase)
            .foregroundStyle(WB.ink.opacity(0.45))
    }
}

/// Earliest upcoming booking — the "next up" moment.
private func wbNextUp(_ items: [Booking]) -> Booking? {
    let now = Date()
    return items
        .filter { ($0.start ?? .distantPast) >= now }
        .min { ($0.start ?? .distantFuture) < ($1.start ?? .distantFuture) }
}

// MARK: - Countdown luggage tag

private struct LuggageTag: View {
    let text: String
    let live: Bool
    var onNight: Bool = false
    var pulses: Bool = false

    @State private var pulse = false

    var body: some View {
        if text.isEmpty {
            EmptyView()
        } else {
            HStack(spacing: 5) {
                if live {
                    Circle()
                        .fill(WB.panelCream)
                        .overlay(Circle().stroke(WB.ink.opacity(0.2), lineWidth: 1))
                        .frame(width: 4, height: 4)
                }
                Text(text)
                    .font(.system(size: 11, weight: .bold))
                    .monospacedDigit()
            }
            .foregroundStyle(tagForeground)
            .padding(.horizontal, 9)
            .padding(.vertical, 4)
            .background(Capsule().fill(tagFill))
            .overlay(Capsule().strokeBorder(tagStroke, lineWidth: 1))
            .shadow(color: live && pulses ? WB.yellow.opacity(0.35) : .clear,
                    radius: pulse ? 9 : 3)
            .onAppear {
                guard live && pulses else { return }
                withAnimation(.easeInOut(duration: 1.6).repeatForever(autoreverses: true)) {
                    pulse = true
                }
            }
        }
    }

    // Live = yellow (the rationed brand moment). Upcoming = stroked capsule.
    // Completed = quiet filled chip. Three visually distinct states.
    private var isUpcoming: Bool { !live && text != "Completed" }

    private var tagFill: Color {
        if live { return WB.yellow }
        if isUpcoming { return .clear }
        return onNight ? WBNight.creamOnNight.opacity(0.14) : WB.ink.opacity(0.06)
    }
    private var tagStroke: Color {
        guard isUpcoming else { return .clear }
        return onNight ? WBNight.creamOnNight.opacity(0.45) : WB.ink.opacity(0.3)
    }
    private var tagForeground: Color {
        if live { return WB.ink }
        return onNight ? WBNight.creamOnNight : WB.ink.opacity(0.6)
    }
}

// MARK: - Compact transcript bubble

struct TripCompactCard: View {
    let card: WanderbotCard
    var trip: Trip?
    var bookingCount: Int = 0

    var body: some View {
        VStack(spacing: 0) {
            // Sky band
            ZStack {
                NightSkyScene(variant: .compact,
                              accent: WB.accentRGB(trip),
                              seedID: trip?.id ?? card.title,
                              scene: WBScene.forTrip(trip))
                VStack {
                    HStack {
                        HStack(spacing: 5) {
                            Image(systemName: "paperplane.fill").font(.system(size: 11))
                            Text("Wanderbot").font(.system(size: 12, weight: .semibold))
                        }
                        .foregroundStyle(WBNight.creamOnNight.opacity(0.9))
                        Spacer()
                        Text("TRIP")
                            .font(.system(size: 10, weight: .bold))
                            .tracking(2)
                            .foregroundStyle(WBNight.creamOnNight)
                            .padding(.horizontal, 9).padding(.vertical, 4)
                            .background(Capsule().strokeBorder(WBNight.creamOnNight.opacity(0.45), lineWidth: 1))
                    }
                    Spacer()
                    VStack(alignment: .leading, spacing: 2) {
                        let eyebrow = trip.flatMap { WB.eyebrow(for: $0) } ?? (trip == nil ? card.subtitle : nil)
                        if let eyebrow, !eyebrow.isEmpty {
                            Text(eyebrow.uppercased())
                                .font(.system(size: 10, weight: .semibold))
                                .tracking(2.4)
                                .foregroundStyle(WBNight.creamOnNight.opacity(0.8))
                                .lineLimit(1)
                        }
                        Text(trip?.title ?? card.title)
                            .font(.system(size: 20, weight: .semibold))
                            .tracking(-0.3)
                            .foregroundStyle(WBNight.creamOnNight)
                            .lineLimit(1)
                            .minimumScaleFactor(0.75)
                            .shadow(color: WBNight.nightBase.color.opacity(0.5), radius: 4, y: 1)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(14)
            }
            .frame(height: 104)

            // Paper footer
            HStack {
                if let trip {
                    // One Text so the interpunct spacing is typographically even.
                    (Text(WBFormat.tripDateRange(trip))
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(WB.ink)
                     + Text(bookingCount > 0 ? " · \(bookingCount) \(bookingCount == 1 ? "plan" : "plans")" : "")
                        .font(.system(size: 12))
                        .foregroundColor(WB.ink.opacity(0.5)))
                        .lineLimit(1)
                } else if let sub = card.subtitle {
                    Text(sub).font(.system(size: 12, weight: .semibold)).foregroundStyle(WB.ink).lineLimit(1)
                }
                Spacer(minLength: 8)
                if let trip {
                    let cd = WB.countdown(trip)
                    LuggageTag(text: cd.text, live: cd.live)
                } else {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(WB.ink.opacity(0.4))
                }
            }
            .padding(.horizontal, 14)
            .frame(height: 46)
            .frame(maxWidth: .infinity)
            .background(WB.panelCream)
            .overlay(alignment: .top) { Rectangle().fill(WB.ink.opacity(0.08)).frame(height: 1) }
        }
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous)
            .strokeBorder(WB.ink.opacity(0.10), lineWidth: 1))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous)
            .strokeBorder(Color.white.opacity(0.10), lineWidth: 1))
        .shadow(color: WB.ink.opacity(0.16), radius: 16, y: 6)
        .padding(10)
    }
}

// MARK: - Expanded viewer

enum TripTab: String, CaseIterable, Identifiable {
    case overview = "Overview", itinerary = "Itinerary", map = "Map", budget = "Budget"
    var id: String { rawValue }
}

struct TripViewer: View {
    @ObservedObject var store: TripStore
    let card: WanderbotCard
    let onOpen: (String?) -> Void
    /// Debug-harness hook: open on a specific tab (nil in production).
    var initialTab: TripTab? = nil

    @State private var selectedTripID: String?
    @State private var tab: TripTab = .overview
    @Namespace private var tabNS

    private var activeTrip: Trip? {
        store.trip(id: selectedTripID) ?? store.trip(id: card.resolvedTripID) ?? store.mostRelevantTrip
    }

    var body: some View {
        Group {
            switch store.phase {
            case .idle, .loading:
                LoadingNight()
            case .failed where store.trips.isEmpty:
                RetryCard(store: store)
            default:
                if let trip = activeTrip {
                    content(trip)
                } else {
                    RetryCard(store: store)
                }
            }
        }
        .background(WB.cream)
        .task {
            if let initialTab { tab = initialTab }
            if selectedTripID == nil { selectedTripID = card.resolvedTripID }
            if store.phase == .idle { await store.load() }
        }
    }

    // MARK: layout

    private func content(_ trip: Trip) -> some View {
        ZStack(alignment: .top) {
            // Night hero, pinned behind the sheet
            NightSkyScene(variant: .hero,
                          accent: WB.accentRGB(trip),
                          seedID: trip.id,
                          scene: WBScene.forTrip(trip),
                          animated: true)
                .frame(height: 208)
                .overlay(alignment: .top) { heroTopRow(trip) }
                .overlay(alignment: .bottomLeading) { heroText(trip) }
                .animation(.easeOut(duration: 0.35), value: trip.id)

            // Cream sheet overlapping the mountain bases
            VStack(spacing: 0) {
                Color.clear.frame(height: 184)
                sheet(trip)
            }
        }
        .safeAreaInset(edge: .bottom) { cta(trip) }
    }

    private func heroTopRow(_ trip: Trip) -> some View {
        HStack {
            HStack(spacing: 5) {
                Image(systemName: "paperplane.fill").font(.system(size: 11))
                Text("Wanderbot").font(.system(size: 12, weight: .semibold))
            }
            .foregroundStyle(WBNight.creamOnNight.opacity(0.9))
            Spacer()
            if store.trips.count > 1 {
                Menu {
                    ForEach(store.trips) { t in
                        Button {
                            withAnimation(.easeOut(duration: 0.35)) { selectedTripID = t.id }
                        } label: {
                            Label(t.title, systemImage: t.id == trip.id ? "checkmark" : "suitcase")
                        }
                    }
                } label: {
                    HStack(spacing: 5) {
                        Text("TRIP · \(store.trips.count)")
                            .font(.system(size: 10, weight: .bold))
                            .tracking(1.5)
                        Image(systemName: "chevron.up.chevron.down").font(.system(size: 10))
                    }
                    .foregroundStyle(WBNight.creamOnNight)
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .background(Capsule().strokeBorder(WBNight.creamOnNight.opacity(0.45), lineWidth: 1))
                }
            }
        }
        .padding(16)
    }

    private func heroText(_ trip: Trip) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            if let eyebrow = WB.eyebrow(for: trip) {
                Text(eyebrow.uppercased())
                    .font(.system(size: 11, weight: .semibold))
                    .tracking(2.8)
                    .foregroundStyle(WBNight.creamOnNight.opacity(0.82))
                    .lineLimit(1)
            }
            Text(trip.title)
                .font(.system(size: 34, weight: .semibold))
                .tracking(-0.5)
                .foregroundStyle(WBNight.creamOnNight)
                .lineLimit(2)
                .minimumScaleFactor(0.7)
                .shadow(color: WBNight.nightBase.color.opacity(0.5), radius: 4, y: 1)
            HStack(spacing: 8) {
                HStack(spacing: 5) {
                    Image(systemName: "calendar").font(.system(size: 12))
                    Text(WBFormat.tripDateRange(trip))
                        .font(.system(size: 13, weight: .semibold))
                        .monospacedDigit()
                }
                .foregroundStyle(WBNight.creamOnNight.opacity(0.85))
                let cd = WB.countdown(trip)
                LuggageTag(text: cd.text, live: cd.live, onNight: true, pulses: true)
            }
        }
        .padding(16)
        .padding(.bottom, 32)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func sheet(_ trip: Trip) -> some View {
        ZStack(alignment: .top) {
            UnevenRoundedRectangle(
                cornerRadii: .init(topLeading: 24, topTrailing: 24),
                style: .continuous
            )
            .fill(WB.cream)
            .shadow(color: WB.ink.opacity(0.12), radius: 20, y: -6)
            .ignoresSafeArea(edges: .bottom)

            VStack(spacing: 0) {
                navPill
                    .offset(y: -21)

                ScrollView(showsIndicators: false) {
                    Group {
                        switch tab {
                        case .overview:
                            OverviewTab(store: store, trip: trip) { tab = .itinerary }
                        case .itinerary:
                            ItineraryTab(store: store, trip: trip)
                        case .map:
                            MapTab(store: store, trip: trip)
                        case .budget:
                            BudgetTab(store: store, trip: trip)
                        }
                    }
                    .id(tab)
                    .transition(.asymmetric(
                        insertion: .opacity.combined(with: .offset(y: 10)),
                        removal: .opacity))
                    .padding(.horizontal, 16)
                    .padding(.top, 4)
                    .padding(.bottom, 120)   // last row scrolls fully clear of the CTA
                }
                .animation(.snappy(duration: 0.3), value: tab)
            }
        }
    }

    private var navPill: some View {
        HStack(spacing: 0) {
            ForEach(TripTab.allCases) { t in
                let on = t == tab
                Button {
                    withAnimation(.snappy(duration: 0.3, extraBounce: 0.06)) { tab = t }
                } label: {
                    Text(t.rawValue)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(on ? WBNight.creamOnNight : WB.ink.opacity(0.55))
                        .frame(maxWidth: .infinity)
                        .frame(height: 34)
                        .background {
                            if on {
                                Capsule().fill(WBNight.nightDeep.color)
                                    .matchedGeometryEffect(id: "tabpill", in: tabNS)
                            }
                        }
                }
                .buttonStyle(WBPressStyle())
            }
        }
        .padding(4)
        .background(Capsule().fill(WB.surface))
        .overlay(Capsule().strokeBorder(WB.ink.opacity(0.08), lineWidth: 1))
        .shadow(color: WB.ink.opacity(0.07), radius: 10, y: 3)
        .frame(height: 42)
        .padding(.horizontal, 16)
        .sensoryFeedback(.selection, trigger: tab)
    }

    private func cta(_ trip: Trip) -> some View {
        Button {
            onOpen("/trip/\(trip.id)")
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "paperplane.fill")
                    .font(.system(size: 15))
                    .foregroundStyle(WB.yellow)
                Text("Open in Wanderbot")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(WBNight.creamOnNight)
                Image(systemName: "arrow.right")
                    .font(.system(size: 13))
                    .foregroundStyle(WBNight.creamOnNight)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(LinearGradient(colors: [WBNight.nightMid.color, WBNight.nightDeep.color],
                                         startPoint: .top, endPoint: .bottom))
            )
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(Color.white.opacity(0.10), lineWidth: 1))
            .shadow(color: WBNight.nightDeep.color.opacity(0.35), radius: 14, y: 6)
        }
        .buttonStyle(WBPressStyle())
        .padding(.horizontal, 16)
        .padding(.bottom, 10)
        .padding(.top, 32)
        .background(
            // Tall fade so scrolling content dissolves under the CTA instead
            // of being sliced off by it.
            LinearGradient(stops: [
                .init(color: WB.cream.opacity(0), location: 0),
                .init(color: WB.cream.opacity(0.85), location: 0.45),
                .init(color: WB.cream, location: 1),
            ], startPoint: .top, endPoint: .bottom)
        )
    }
}

// MARK: - Loading / error states (never a bare void)

private struct LoadingNight: View {
    @State private var glow = false

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                NightSkyScene(variant: .compact, accent: nil, seedID: "loading", showMountains: false)
                VStack(spacing: 10) {
                    Circle()
                        .fill(RadialGradient(colors: [WBNight.moonCore.color, WBNight.moonEdge.color],
                                             center: UnitPoint(x: 0.4, y: 0.4), startRadius: 0, endRadius: 16))
                        .frame(width: 26, height: 26)
                        .shadow(color: WBNight.moonCore.color.opacity(glow ? 0.8 : 0.3), radius: 14)
                    Text("PREPARING YOUR TRIP")
                        .font(.system(size: 11, weight: .heavy))
                        .tracking(2)
                        .foregroundStyle(WBNight.creamOnNight.opacity(0.7))
                }
            }
            .frame(height: 120)
            .frame(maxWidth: .infinity)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(WB.cream)
        .onAppear {
            withAnimation(.easeInOut(duration: 1.4).repeatForever(autoreverses: true)) { glow = true }
        }
    }
}

private struct RetryCard: View {
    @ObservedObject var store: TripStore

    var body: some View {
        VStack(spacing: 14) {
            ZStack {
                Circle().fill(WBNight.nightDeep.color.opacity(0.08))
                    .frame(width: 72, height: 72)
                Image(systemName: "wifi.exclamationmark")
                    .font(.system(size: 26))
                    .foregroundStyle(WBNight.nightMid.color)
            }
            Text("Couldn't load your trips")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(WB.ink)
            Button {
                Task { await store.load() }
            } label: {
                Text("Retry")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(WBNight.creamOnNight)
                    .padding(.horizontal, 22).padding(.vertical, 9)
                    .background(Capsule().fill(WBNight.nightDeep.color))
            }
            .buttonStyle(WBPressStyle())
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
        .wbCard(radius: 16)
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(WB.cream)
    }
}

// MARK: - Overview

private struct OverviewTab: View {
    @ObservedObject var store: TripStore
    let trip: Trip
    var seeItinerary: () -> Void

    var body: some View {
        let items = store.bookings(for: trip.id)
        let places = max(Set(items.compactMap { $0.mapPlace?.name }).count, 1)
        let next = wbNextUp(items)
        let accent = WB.accentRGB(trip)?.color ?? WB.ink.opacity(0.45)

        VStack(alignment: .leading, spacing: 24) {
            // Stat trio
            HStack(spacing: 12) {
                StatCard(value: trip.dayCount, label: trip.dayCount == 1 ? "day" : "days")
                StatCard(value: items.count, label: items.count == 1 ? "plan" : "plans")
                StatCard(value: places, label: places == 1 ? "place" : "places")
            }
            .padding(.top, 8)

            if let summary = trip.summary, !summary.isEmpty {
                HStack(alignment: .top, spacing: 0) {
                    RoundedRectangle(cornerRadius: 1).fill(accent).frame(width: 2)
                    Text(summary)
                        .font(.system(size: 15))
                        .lineSpacing(3)
                        .foregroundStyle(WB.ink.opacity(0.70))
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.leading, 12)
                }
            }

            if let next {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Next up").wbSectionLabel()
                    NextUpCard(booking: next, seedID: trip.id)
                }
            }

            // With a single plan, Next Up already told the whole story —
            // repeating it in a glance list reads like a template stutter.
            let sections = store.itinerary(for: trip)
            if !sections.isEmpty && items.count > 1 {
                VStack(alignment: .leading, spacing: 12) {
                    Text("At a glance").wbSectionLabel()
                    ForEach(Array(sections.prefix(2))) { section in
                        DayGlance(section: section)
                    }
                    if sections.count > 2 {
                        Button(action: seeItinerary) {
                            Text("See full itinerary →")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(WBNight.nightMid.color)
                        }
                        .buttonStyle(WBPressStyle())
                    }
                }
            }
        }
    }
}

private struct StatCard: View {
    let value: Int
    let label: String

    var body: some View {
        VStack(spacing: 2) {
            Text("\(value)")
                .font(.system(size: 24, weight: .heavy, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(WB.ink)
                .contentTransition(.numericText())
            Text(label.uppercased())
                .font(.system(size: 10, weight: .heavy))
                .tracking(1)
                .foregroundStyle(WB.ink.opacity(0.45))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .wbCard()
    }
}

/// The signature night card: next upcoming booking on a starlit panel.
private struct NextUpCard: View {
    let booking: Booking
    let seedID: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            ZStack {
                Circle().fill(WBNight.creamOnNight.opacity(0.14))
                Image(systemName: WB.symbol(for: booking))
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(WBNight.creamOnNight)
            }
            .frame(width: 34, height: 34)

            VStack(alignment: .leading, spacing: 3) {
                Text(booking.title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(WBNight.creamOnNight)
                    .lineLimit(2)
                if let place = booking.mapPlace?.name, !wbRedundant(booking.title, place) {
                    HStack(spacing: 4) {
                        Image(systemName: "mappin").font(.system(size: 10))
                        Text(place).lineLimit(1)
                    }
                    .font(.system(size: 12))
                    .foregroundStyle(WBNight.creamOnNight.opacity(0.6))
                } else if let d = ISO8601.day(from: booking.dayKey) {
                    Text(WBFormat.dayHeader(d))
                        .font(.system(size: 12))
                        .foregroundStyle(WBNight.creamOnNight.opacity(0.6))
                }
            }
            Spacer(minLength: 8)

            VStack(alignment: .trailing, spacing: 2) {
                if let sub = booking.subLabel(on: booking.dayKey) {
                    Text(sub.uppercased())
                        .font(.system(size: 9, weight: .bold))
                        .tracking(0.8)
                        .foregroundStyle(WBNight.creamOnNight.opacity(0.55))
                }
                if let t = booking.displayTime(on: booking.dayKey) {
                    Text(WBFormat.time(t))
                        .font(.system(size: 15, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(WB.yellow)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(LinearGradient(colors: [WBNight.nightMid.color, WBNight.nightDeep.color],
                                     startPoint: .topLeading, endPoint: .bottomTrailing))
                .overlay(
                    MiniStars(seedID: seedID + "next", count: 12)
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                )
        )
        .shadow(color: WB.ink.opacity(0.16), radius: 16, y: 6)
        .shadow(color: WBNight.nightDeep.color.opacity(0.35), radius: 14, y: 6)
    }
}

/// Sparse static starfield for small night panels.
private struct MiniStars: View {
    let seedID: String
    let count: Int

    var body: some View {
        Canvas { context, size in
            var state: UInt64 = {
                var h: UInt64 = 0xcbf29ce484222325
                for b in seedID.utf8 { h ^= UInt64(b); h = h &* 0x100000001b3 }
                return h == 0 ? 1 : h
            }()
            func rand() -> Double {
                state = state &* 6364136223846793005 &+ 1442695040888963407
                return Double(state >> 33) / Double(UInt32.max)
            }
            for _ in 0..<count {
                let x = rand() * size.width
                let y = rand() * size.height
                let r = 0.5 + rand() * 0.7
                context.fill(Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)),
                             with: .color(WBNight.starCream.color.opacity(0.4)))
            }
        }
        .allowsHitTesting(false)
    }
}

private struct DayGlance: View {
    let section: WBDaySection

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                // Fixed brand token — a date marker must not change color per trip.
                Circle().fill(WBNight.nightMid.color).frame(width: 6, height: 6)
                Text((section.date.map { WBFormat.dayHeader($0) } ?? section.dayKey).uppercased())
                    .font(.system(size: 11, weight: .heavy))
                    .tracking(1.6)
                    .foregroundStyle(WB.ink.opacity(0.45))
            }
            ForEach(section.items.prefix(3)) { b in
                HStack(spacing: 8) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .fill(WB.typeColor(b.type).opacity(0.14))
                        Image(systemName: WB.symbol(for: b))
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(WB.typeColor(b.type))
                    }
                    .frame(width: 22, height: 22)
                    Text(b.title)
                        .font(.system(size: 13))
                        .foregroundStyle(WB.ink)
                        .lineLimit(1)
                }
            }
            if section.items.count > 3 {
                Text("+\(section.items.count - 3) more")
                    .font(.system(size: 11))
                    .foregroundStyle(WB.ink.opacity(0.45))
                    .padding(.leading, 30)
            }
        }
    }
}

// MARK: - Itinerary

private struct ItineraryTab: View {
    @ObservedObject var store: TripStore
    let trip: Trip

    var body: some View {
        let sections = store.itinerary(for: trip)
        if sections.isEmpty {
            EmptyMoment(icon: "moon.stars", title: "No plans yet",
                        hint: "Text Wanderbot what you'd like to do and it'll build your days.")
                .padding(.top, 16)
        } else {
            VStack(alignment: .leading, spacing: 24) {
                ForEach(Array(sections.enumerated()), id: \.element.id) { idx, section in
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(spacing: 8) {
                            Text("DAY \(idx + 1)")
                                .font(.system(size: 10, weight: .heavy))
                                .tracking(1)
                                .foregroundStyle(WBNight.creamOnNight)
                                .padding(.horizontal, 8).padding(.vertical, 3)
                                .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(WB.ink))
                            Text(section.date.map { WBFormat.dayHeader($0) } ?? section.dayKey)
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(WB.ink)
                        }
                        // Days where nothing is timed drop the time column
                        // entirely — an empty 64pt gutter reads like missing
                        // data, not layout.
                        let hasTimes = section.items.contains {
                            $0.displayTime(on: section.dayKey) != nil || $0.role(on: section.dayKey) == .spanMiddle
                        }
                        VStack(spacing: 0) {
                            ForEach(Array(section.items.enumerated()), id: \.element.id) { i, b in
                                BookingRow(booking: b, dayKey: section.dayKey, showTimeColumn: hasTimes)
                                if i < section.items.count - 1 {
                                    Rectangle()
                                        .fill(WB.ink.opacity(0.08))
                                        .frame(height: 1)
                                        .padding(.leading, hasTimes ? 118 : 54)
                                }
                            }
                        }
                        .wbCard()
                    }
                }
            }
            .padding(.top, 8)
        }
    }
}

private struct BookingRow: View {
    let booking: Booking
    let dayKey: String
    var showTimeColumn: Bool = true

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            // Time column (dropped entirely when the whole day is untimed)
            if showTimeColumn {
                VStack(alignment: .leading, spacing: 1) {
                    if let t = booking.displayTime(on: dayKey) {
                        Text(WBFormat.time(t))
                            .font(.system(size: 13, weight: .semibold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(WB.ink)
                    } else if booking.role(on: dayKey) == .spanMiddle {
                        Text("All day")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(WB.ink.opacity(0.55))
                    } else {
                        Text("—")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(WB.ink.opacity(0.25))
                    }
                    if let sub = booking.subLabel(on: dayKey) {
                        Text(sub)
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(WB.typeColor(booking.type))
                    }
                }
                .frame(width: 64, alignment: .leading)
                .padding(.top, 1)
            }

            // Icon tile
            ZStack {
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .fill(WB.typeColor(booking.type).opacity(0.14))
                Image(systemName: WB.symbol(for: booking))
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(WB.typeColor(booking.type))
            }
            .frame(width: 30, height: 30)

            // Body
            VStack(alignment: .leading, spacing: 2) {
                Text(booking.title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(WB.ink)
                    .lineLimit(2)
                if let meta = metaLine {
                    Text(meta)
                        .font(.system(size: 12))
                        .foregroundStyle(WB.ink.opacity(0.55))
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)

            // Trailing
            VStack(alignment: .trailing, spacing: 2) {
                if let cost = booking.cost {
                    Text(WBFormat.money(cost))
                        .font(.system(size: 11, weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(WB.ink.opacity(0.75))
                }
                if let conf = booking.confirmation, !conf.isEmpty {
                    Text("#\(conf)")
                        .font(.system(size: 10.5))
                        .monospacedDigit()
                        .foregroundStyle(WB.ink.opacity(0.45))
                        .lineLimit(1)
                }
            }
        }
        .padding(.vertical, 11)
        .padding(.horizontal, 12)
    }

    private var metaLine: String? {
        let meta: String?
        switch booking.type {
        case .flight, .transport:
            if let f = booking.from?.name, let t = booking.to?.name {
                // Routes are never redundant with titles — return directly.
                return "\(shorten(f)) → \(shorten(t))"
            }
            meta = booking.provider ?? booking.mode
        default:
            meta = booking.mapPlace?.name ?? booking.provider
        }
        // A meta line that restates the title is noise, not information.
        guard let meta, !wbRedundant(booking.title, meta) else { return nil }
        return meta
    }

    private func shorten(_ name: String) -> String {
        if let open = name.lastIndex(of: "("),
           let close = name.lastIndex(of: ")"), open < close {
            return String(name[name.index(after: open)..<close])
        }
        return name
    }
}

// MARK: - Map

private struct MapTab: View {
    @ObservedObject var store: TripStore
    let trip: Trip

    @State private var camera: MapCameraPosition = .automatic

    private var pins: [Booking] { store.bookings(for: trip.id).filter { $0.mapPlace != nil } }

    var body: some View {
        let items = pins
        if items.isEmpty {
            EmptyMoment(icon: "mappin.slash", title: "Nothing mapped yet",
                        hint: "Plans with a place attached show up here as pins.")
                .padding(.top, 16)
        } else {
            let next = wbNextUp(items)
            VStack(alignment: .leading, spacing: 16) {
                Map(position: $camera) {
                    ForEach(items) { b in
                        if let p = b.mapPlace {
                            Annotation(b.title, coordinate: p.coordinate) {
                                PinView(symbol: WB.symbol(for: b),
                                        color: WB.typeColor(b.type),
                                        isNext: b.id == next?.id)
                            }
                        }
                    }
                }
                .mapStyle(.standard(emphasis: .muted, pointsOfInterest: .excludingAll))
                .frame(height: 250)
                .overlay(alignment: .top) {
                    LinearGradient(colors: [WBNight.nightDeep.color.opacity(0.45), .clear],
                                   startPoint: .top, endPoint: .bottom)
                        .frame(height: 44)
                        .allowsHitTesting(false)
                }
                .overlay(alignment: .topLeading) {
                    Text("\(items.count) LOCATION\(items.count == 1 ? "" : "S")")
                        .font(.system(size: 10, weight: .bold))
                        .tracking(1)
                        .foregroundStyle(WBNight.creamOnNight)
                        .padding(.horizontal, 9).padding(.vertical, 4)
                        .background(Capsule().fill(WBNight.nightDeep.color.opacity(0.8)))
                        .padding(10)
                }
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(WB.ink.opacity(0.08), lineWidth: 1))
                .shadow(color: WB.ink.opacity(0.07), radius: 10, y: 3)
                .onAppear { camera = .region(region(for: items)) }

                VStack(spacing: 0) {
                    ForEach(Array(items.enumerated()), id: \.element.id) { i, b in
                        Button {
                            if let p = b.mapPlace {
                                withAnimation(.snappy(duration: 0.35)) {
                                    camera = .region(MKCoordinateRegion(
                                        center: p.coordinate,
                                        span: MKCoordinateSpan(latitudeDelta: 0.03, longitudeDelta: 0.03)))
                                }
                            }
                        } label: {
                            HStack(spacing: 10) {
                                ZStack {
                                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                                        .fill(WB.typeColor(b.type).opacity(0.14))
                                    Image(systemName: WB.symbol(for: b))
                                        .font(.system(size: 10, weight: .semibold))
                                        .foregroundStyle(WB.typeColor(b.type))
                                }
                                .frame(width: 22, height: 22)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(b.title)
                                        .font(.system(size: 13, weight: .semibold))
                                        .foregroundStyle(WB.ink)
                                        .lineLimit(1)
                                    if let n = b.mapPlace?.name, !wbRedundant(b.title, n) {
                                        Text(n)
                                            .font(.system(size: 11))
                                            .foregroundStyle(WB.ink.opacity(0.5))
                                            .lineLimit(1)
                                    }
                                }
                                Spacer(minLength: 0)
                                Image(systemName: "location")
                                    .font(.system(size: 11))
                                    .foregroundStyle(WB.ink.opacity(0.3))
                            }
                            .padding(.vertical, 9)
                            .padding(.horizontal, 12)
                        }
                        .buttonStyle(WBPressStyle())
                        if i < items.count - 1 {
                            Rectangle().fill(WB.ink.opacity(0.08)).frame(height: 1).padding(.leading, 44)
                        }
                    }
                }
                .wbCard()
            }
            .padding(.top, 8)
        }
    }

    private func region(for items: [Booking]) -> MKCoordinateRegion {
        let coords = items.compactMap { $0.mapPlace?.coordinate }
        guard let first = coords.first else {
            return MKCoordinateRegion(center: .init(latitude: 0, longitude: 0),
                                      span: .init(latitudeDelta: 60, longitudeDelta: 60))
        }
        var minLat = first.latitude, maxLat = first.latitude
        var minLon = first.longitude, maxLon = first.longitude
        for c in coords {
            minLat = min(minLat, c.latitude); maxLat = max(maxLat, c.latitude)
            minLon = min(minLon, c.longitude); maxLon = max(maxLon, c.longitude)
        }
        return MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: (minLat + maxLat) / 2, longitude: (minLon + maxLon) / 2),
            span: MKCoordinateSpan(latitudeDelta: max((maxLat - minLat) * 1.5, 0.05),
                                   longitudeDelta: max((maxLon - minLon) * 1.5, 0.05)))
    }
}

private struct PinView: View {
    let symbol: String
    let color: Color
    let isNext: Bool

    @State private var halo = false

    var body: some View {
        ZStack {
            if isNext {
                Circle()
                    .fill(WB.yellow.opacity(halo ? 0 : 0.35))
                    .frame(width: 34, height: 34)
                    .scaleEffect(halo ? 1.35 : 1)
            }
            Circle()
                .fill(WB.surface)
                .overlay(Circle().strokeBorder(isNext ? WB.yellow : color,
                                               lineWidth: isNext ? 2.5 : 1.5))
                .shadow(color: WB.ink.opacity(0.25), radius: 4, y: 2)
            Image(systemName: symbol)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(color)
        }
        .frame(width: 28, height: 28)
        .onAppear {
            guard isNext else { return }
            withAnimation(.easeOut(duration: 2).repeatForever(autoreverses: false)) { halo = true }
        }
    }
}

// MARK: - Budget

private struct BudgetTab: View {
    @ObservedObject var store: TripStore
    let trip: Trip

    @State private var appeared = false

    var body: some View {
        if let budget = store.budget(for: trip.id) {
            VStack(alignment: .leading, spacing: 20) {
                // Night total card
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("TOTAL")
                            .font(.system(size: 10, weight: .heavy))
                            .tracking(2)
                            .foregroundStyle(WBNight.creamOnNight.opacity(0.6))
                        Text(WBFormat.money(Cost(amount: budget.total, currency: budget.currency)))
                            .font(.system(size: 36, weight: .semibold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(WBNight.creamOnNight)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                    }
                    Spacer()
                    Circle()
                        .fill(RadialGradient(colors: [WBNight.moonCore.color, WBNight.moonEdge.color],
                                             center: UnitPoint(x: 0.4, y: 0.4), startRadius: 0, endRadius: 10))
                        .frame(width: 16, height: 16)
                        .shadow(color: WBNight.moonCore.color.opacity(0.5), radius: 8)
                }
                .padding(16)
                .frame(maxWidth: .infinity)
                .frame(height: 96)
                .background(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(LinearGradient(colors: [WBNight.nightMid.color, WBNight.nightDeep.color],
                                             startPoint: .topLeading, endPoint: .bottomTrailing))
                        .overlay(MiniStars(seedID: trip.id + "budget", count: 10)
                            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous)))
                )
                .shadow(color: WBNight.nightDeep.color.opacity(0.35), radius: 14, y: 6)

                // Allocation bar
                GeometryReader { geo in
                    let gaps = CGFloat(max(budget.byType.count - 1, 0)) * 2
                    let avail = geo.size.width - gaps
                    HStack(spacing: 2) {
                        ForEach(Array(budget.byType.enumerated()), id: \.offset) { i, entry in
                            let frac = budget.total > 0 ? entry.1 / budget.total : 0
                            RoundedRectangle(cornerRadius: 3)
                                .fill(WB.typeColor(entry.0))
                                .frame(width: appeared ? max(avail * frac, 6) : 6)
                                .animation(.snappy(duration: 0.5).delay(Double(i) * 0.06), value: appeared)
                        }
                    }
                }
                .frame(height: 12)
                .onAppear { appeared = true }

                // Legend
                VStack(spacing: 0) {
                    ForEach(Array(budget.byType.enumerated()), id: \.offset) { i, entry in
                        let frac = budget.total > 0 ? entry.1 / budget.total : 0
                        HStack(spacing: 10) {
                            RoundedRectangle(cornerRadius: 3)
                                .fill(WB.typeColor(entry.0))
                                .frame(width: 10, height: 10)
                            Text(entry.0.label)
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(WB.ink)
                            Spacer()
                            Text(WBFormat.money(Cost(amount: entry.1, currency: budget.currency)))
                                .font(.system(size: 13, weight: .bold, design: .rounded))
                                .monospacedDigit()
                                .foregroundStyle(WB.ink.opacity(0.7))
                            Text("\(Int((frac * 100).rounded()))%")
                                .font(.system(size: 11))
                                .monospacedDigit()
                                .foregroundStyle(WB.ink.opacity(0.4))
                                .frame(width: 34, alignment: .trailing)
                        }
                        .padding(.vertical, 8)
                        if i < budget.byType.count - 1 {
                            Rectangle().fill(WB.ink.opacity(0.08)).frame(height: 1)
                        }
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 4)
                .wbCard()
            }
            .padding(.top, 8)
        } else {
            EmptyMoment(icon: "banknote", title: "No costs yet",
                        hint: "Reply with something like \u{201C}add $180 for the hotel\u{201D} and Wanderbot will track it here.")
                .padding(.top, 16)
        }
    }
}

// MARK: - Shared empty state

/// Designed empty state — soft night disc behind the glyph on a real card,
/// with an actionable hint. (Dashed borders read as wireframe placeholders —
/// the opposite of finished.)
private struct EmptyMoment: View {
    let icon: String
    let title: String
    var hint: String? = nil

    var body: some View {
        VStack(spacing: 14) {
            ZStack {
                Circle().fill(WBNight.nightDeep.color.opacity(0.08))
                    .frame(width: 72, height: 72)
                Image(systemName: icon)
                    .font(.system(size: 26))
                    .foregroundStyle(WBNight.nightMid.color)
            }
            VStack(spacing: 4) {
                Text(title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(WB.ink)
                if let hint {
                    Text(hint)
                        .font(.system(size: 12.5))
                        .lineSpacing(2)
                        .foregroundStyle(WB.ink.opacity(0.45))
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 28)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
        .wbCard(radius: 16)
    }
}
