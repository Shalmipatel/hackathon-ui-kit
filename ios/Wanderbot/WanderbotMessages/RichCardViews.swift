import SwiftUI
import MapKit

// Rich, native trip cards for the iMessage extension. The compact form is the
// in-transcript bubble; the expanded form is a full browsable trip — Overview,
// day-by-day Itinerary, Map, and Budget — reading live data from TripStore.

// MARK: - Shared style

enum WB {
    static let ink = Color(red: 0.09, green: 0.10, blue: 0.13)
    static let yellow = Color(red: 0.996, green: 0.922, blue: 0.161)   // #FEEB29

    static func accent(_ trip: Trip?) -> Color {
        if let hex = trip?.color, let c = Color(hex: hex) { return c }
        return yellow
    }

    static func typeColor(_ type: BookingType) -> Color {
        switch type {
        case .flight:                return Color(red: 0.56, green: 0.72, blue: 0.91)
        case .hotel:                 return Color(red: 0.98, green: 0.80, blue: 0.24)
        case .restaurant:            return Color(red: 0.95, green: 0.61, blue: 0.42)
        case .attraction, .experience, .event: return Color(red: 0.78, green: 0.66, blue: 0.91)
        case .activity, .transport:  return Color(red: 0.49, green: 0.77, blue: 0.63)
        }
    }

    static func typeSymbol(_ type: BookingType) -> String {
        switch type {
        case .flight: return "airplane"
        case .hotel: return "bed.double.fill"
        case .restaurant: return "fork.knife"
        case .attraction: return "camera.fill"
        case .experience: return "sparkles"
        case .event: return "ticket.fill"
        case .activity: return "figure.walk"
        case .transport: return "tram.fill"
        }
    }

    /// "In 12 days" / "Day 2 of 5" / "Wrapped" style status for a trip.
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
        if today > end { return ("Wrapped", false) }
        let dayNum = (cal.dateComponents([.day], from: start, to: today).day ?? 0) + 1
        return ("Day \(dayNum) of \(trip.dayCount)", true)
    }
}

// MARK: - Compact bubble

/// The small card shown inline in the Messages transcript. Payload-driven so it
/// renders instantly; enriched with live stats once the store loads.
struct TripCompactCard: View {
    let card: WanderbotCard
    var trip: Trip?
    var bookingCount: Int = 0

    private var accent: Color { WB.accent(trip) }

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 13, style: .continuous)
                    .fill(LinearGradient(colors: [accent, accent.opacity(0.6)],
                                         startPoint: .topLeading, endPoint: .bottomTrailing))
                Image(systemName: trip != nil ? "suitcase.fill" : CardStyle.symbol(card.type))
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(WB.ink)
            }
            .frame(width: 46, height: 46)

            VStack(alignment: .leading, spacing: 2) {
                Text(trip?.title ?? card.title)
                    .font(.system(size: 16, weight: .bold)).lineLimit(1)
                    .foregroundStyle(.primary)
                if let sub = compactSubtitle {
                    Text(sub).font(.system(size: 12.5)).foregroundStyle(.secondary).lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            if let trip {
                let cd = WB.countdown(trip)
                if !cd.text.isEmpty {
                    Text(cd.text)
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(cd.live ? WB.ink : .secondary)
                        .padding(.horizontal, 9).padding(.vertical, 5)
                        .background(Capsule().fill(cd.live ? accent : Color(.tertiarySystemFill)))
                }
            } else {
                Image(systemName: "chevron.right").font(.system(size: 12, weight: .bold))
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Color(.secondarySystemBackground)))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(accent.opacity(0.35), lineWidth: 1))
        .padding(10)
    }

    private var compactSubtitle: String? {
        if let trip {
            var bits = [WBFormat.tripDateRange(trip)]
            if bookingCount > 0 { bits.append("\(bookingCount) \(bookingCount == 1 ? "plan" : "plans")") }
            return bits.joined(separator: " · ")
        }
        return card.subtitle
    }
}

// MARK: - Expanded viewer

enum TripTab: String, CaseIterable, Identifiable {
    case overview = "Overview", itinerary = "Itinerary", map = "Map", budget = "Budget"
    var id: String { rawValue }
    var icon: String {
        switch self {
        case .overview: return "square.grid.2x2.fill"
        case .itinerary: return "list.bullet.rectangle.fill"
        case .map: return "map.fill"
        case .budget: return "creditcard.fill"
        }
    }
}

struct TripViewer: View {
    @ObservedObject var store: TripStore
    let card: WanderbotCard
    let onOpen: (String?) -> Void

    @State private var selectedTripID: String?
    @State private var tab: TripTab = .overview

    private var activeTrip: Trip? {
        store.trip(id: selectedTripID) ?? store.trip(id: card.resolvedTripID) ?? store.trips.first
    }

    var body: some View {
        VStack(spacing: 0) {
            switch store.phase {
            case .idle, .loading:
                loading
            case .failed where store.trips.isEmpty:
                failed
            default:
                if let trip = activeTrip {
                    content(trip)
                } else {
                    failed
                }
            }
        }
        .task {
            if selectedTripID == nil { selectedTripID = card.resolvedTripID }
            if store.phase == .idle { await store.load() }
        }
    }

    // MARK: Content

    private func content(_ trip: Trip) -> some View {
        let accent = WB.accent(trip)
        return VStack(spacing: 0) {
            HeroHeader(trip: trip, accent: accent,
                       bookingCount: store.bookings(for: trip.id).count,
                       allTrips: store.trips, selectedTripID: $selectedTripID)

            TabStrip(tab: $tab, accent: accent)

            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    switch tab {
                    case .overview:  OverviewTab(store: store, trip: trip, accent: accent) { tab = $1 }
                    case .itinerary: ItineraryTab(store: store, trip: trip, accent: accent)
                    case .map:       MapTab(store: store, trip: trip, accent: accent)
                    case .budget:    BudgetTab(store: store, trip: trip, accent: accent)
                    }
                }
                .padding(16)
                .padding(.bottom, 80)
            }
        }
        .safeAreaInset(edge: .bottom) {
            Button { onOpen("/trip/\(trip.id)") } label: {
                HStack(spacing: 7) {
                    Image(systemName: "arrow.up.forward.app.fill")
                    Text("Open in Wanderbot").font(.system(size: 16, weight: .semibold))
                }
                .frame(maxWidth: .infinity).padding(.vertical, 14)
                .background(accent).foregroundStyle(WB.ink)
                .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
            }
            .padding(.horizontal, 16).padding(.bottom, 10)
            .background(.ultraThinMaterial)
        }
    }

    private var loading: some View {
        VStack(spacing: 12) {
            ProgressView().controlSize(.large)
            Text("Loading your trip…").font(.system(size: 14)).foregroundStyle(.secondary)
        }.frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var failed: some View {
        VStack(spacing: 10) {
            Image(systemName: "wifi.exclamationmark").font(.system(size: 30)).foregroundStyle(.secondary)
            Text("Couldn't load trip data").font(.system(size: 15, weight: .semibold))
            Button("Retry") { Task { await store.load() } }.buttonStyle(.bordered)
        }.frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Hero header

private struct HeroHeader: View {
    let trip: Trip
    let accent: Color
    let bookingCount: Int
    let allTrips: [Trip]
    @Binding var selectedTripID: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(trip.destination.uppercased())
                        .font(.system(size: 11, weight: .heavy)).tracking(1.4)
                        .foregroundStyle(WB.ink.opacity(0.65))
                    Text(trip.title)
                        .font(.system(size: 26, weight: .heavy)).foregroundStyle(WB.ink)
                        .lineLimit(2).minimumScaleFactor(0.8)
                }
                Spacer(minLength: 8)
                if allTrips.count > 1 {
                    Menu {
                        ForEach(allTrips) { t in
                            Button { selectedTripID = t.id } label: {
                                Label(t.title, systemImage: t.id == trip.id ? "checkmark" : "suitcase")
                            }
                        }
                    } label: {
                        Image(systemName: "chevron.up.chevron.down")
                            .font(.system(size: 13, weight: .bold)).foregroundStyle(WB.ink)
                            .padding(8).background(Circle().fill(WB.ink.opacity(0.12)))
                    }
                }
            }
            HStack(spacing: 8) {
                Label(WBFormat.tripDateRange(trip), systemImage: "calendar")
                    .font(.system(size: 13, weight: .semibold)).foregroundStyle(WB.ink.opacity(0.85))
                let cd = WB.countdown(trip)
                if !cd.text.isEmpty {
                    Text(cd.text)
                        .font(.system(size: 12, weight: .bold)).foregroundStyle(WB.ink)
                        .padding(.horizontal, 9).padding(.vertical, 4)
                        .background(Capsule().fill(WB.ink.opacity(0.14)))
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(
            LinearGradient(colors: [accent, accent.opacity(0.72)],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
        )
    }
}

private struct TabStrip: View {
    @Binding var tab: TripTab
    let accent: Color

    var body: some View {
        HStack(spacing: 0) {
            ForEach(TripTab.allCases) { t in
                let on = t == tab
                Button {
                    withAnimation(.easeOut(duration: 0.15)) { tab = t }
                } label: {
                    VStack(spacing: 3) {
                        Image(systemName: t.icon).font(.system(size: 15, weight: .semibold))
                        Text(t.rawValue).font(.system(size: 10, weight: .semibold))
                    }
                    .foregroundStyle(on ? .primary : .secondary)
                    .frame(maxWidth: .infinity).padding(.vertical, 9)
                    .overlay(alignment: .bottom) {
                        Rectangle().fill(on ? accent : .clear).frame(height: 2.5)
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .background(Color(.systemBackground))
        .overlay(alignment: .bottom) { Divider() }
    }
}

// MARK: - Overview tab

private struct OverviewTab: View {
    @ObservedObject var store: TripStore
    let trip: Trip
    let accent: Color
    var jump: (Trip, TripTab) -> Void

    var body: some View {
        let items = store.bookings(for: trip.id)
        let cities = Set(items.compactMap { $0.mapPlace?.name }).count
        let next = nextUp(items)

        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                StatPill(value: "\(trip.dayCount)", label: trip.dayCount == 1 ? "day" : "days", accent: accent)
                StatPill(value: "\(items.count)", label: items.count == 1 ? "plan" : "plans", accent: accent)
                StatPill(value: "\(max(cities, 1))", label: "places", accent: accent)
            }

            if let summary = trip.summary, !summary.isEmpty {
                Text(summary).font(.system(size: 14)).foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if let next {
                SectionLabel("Next up")
                BookingRow(booking: next, dayKey: next.dayKey, accent: accent)
                    .padding(10)
                    .background(RoundedRectangle(cornerRadius: 14).fill(Color(.secondarySystemBackground)))
            }

            SectionLabel("At a glance")
            let preview = store.itinerary(for: trip).prefix(2)
            ForEach(Array(preview)) { section in
                DayGlance(section: section, accent: accent)
            }
            if store.itinerary(for: trip).count > 2 {
                Button { jump(trip, .itinerary) } label: {
                    Text("See full day-by-day →").font(.system(size: 13, weight: .semibold)).foregroundStyle(accent)
                }
            }
        }
    }

    private func nextUp(_ items: [Booking]) -> Booking? {
        let now = Date()
        return items.filter { ($0.start ?? .distantPast) >= now }
            .sorted { ($0.start ?? .distantFuture) < ($1.start ?? .distantFuture) }.first
    }
}

private struct StatPill: View {
    let value: String; let label: String; let accent: Color
    var body: some View {
        VStack(spacing: 1) {
            Text(value).font(.system(size: 21, weight: .heavy)).foregroundStyle(.primary)
            Text(label.uppercased()).font(.system(size: 9, weight: .bold)).tracking(0.6).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 12)
        .background(RoundedRectangle(cornerRadius: 14).fill(accent.opacity(0.14)))
    }
}

private struct DayGlance: View {
    let section: DaySection; let accent: Color
    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                Text(dayTitle).font(.system(size: 12, weight: .bold)).foregroundStyle(accent)
                ForEach(section.items.prefix(3)) { b in
                    HStack(spacing: 7) {
                        Image(systemName: WB.typeSymbol(b.type)).font(.system(size: 10))
                            .foregroundStyle(WB.typeColor(b.type)).frame(width: 14)
                        Text(b.title).font(.system(size: 13)).lineLimit(1).foregroundStyle(.primary)
                    }
                }
                if section.items.count > 3 {
                    Text("+\(section.items.count - 3) more").font(.system(size: 11)).foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 4)
    }
    private var dayTitle: String {
        guard let d = section.date else { return section.dayKey }
        return WBFormat.dayHeader(d)
    }
}

// MARK: - Itinerary tab

private struct ItineraryTab: View {
    @ObservedObject var store: TripStore
    let trip: Trip
    let accent: Color

    var body: some View {
        let sections = store.itinerary(for: trip)
        if sections.isEmpty {
            EmptyHint(icon: "calendar.badge.plus", text: "No plans yet for this trip.")
        } else {
            VStack(alignment: .leading, spacing: 18) {
                ForEach(Array(sections.enumerated()), id: \.element.id) { idx, section in
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 8) {
                            Text("DAY \(idx + 1)").font(.system(size: 10, weight: .heavy)).tracking(1)
                                .foregroundStyle(WB.ink)
                                .padding(.horizontal, 7).padding(.vertical, 3)
                                .background(Capsule().fill(accent))
                            Text(section.date.map { WBFormat.dayHeader($0) } ?? section.dayKey)
                                .font(.system(size: 13, weight: .bold)).foregroundStyle(.primary)
                        }
                        VStack(spacing: 0) {
                            ForEach(Array(section.items.enumerated()), id: \.element.id) { i, b in
                                BookingRow(booking: b, dayKey: section.dayKey, accent: accent)
                                    .padding(.vertical, 9)
                                if i < section.items.count - 1 { Divider().padding(.leading, 46) }
                            }
                        }
                        .padding(.horizontal, 12)
                        .background(RoundedRectangle(cornerRadius: 14).fill(Color(.secondarySystemBackground)))
                    }
                }
            }
        }
    }
}

private struct BookingRow: View {
    let booking: Booking
    let dayKey: String
    let accent: Color

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            ZStack {
                Circle().fill(WB.typeColor(booking.type).opacity(0.2))
                Image(systemName: WB.typeSymbol(booking.type))
                    .font(.system(size: 14, weight: .semibold)).foregroundStyle(WB.typeColor(booking.type))
            }
            .frame(width: 34, height: 34)

            VStack(alignment: .leading, spacing: 2) {
                Text(booking.title).font(.system(size: 14.5, weight: .semibold)).foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)
                if let place = booking.mapPlace?.name {
                    Label(place, systemImage: "mappin").font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1)
                }
                if let provider = booking.provider, booking.mapPlace?.name == nil {
                    Text(provider).font(.system(size: 12)).foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)

            VStack(alignment: .trailing, spacing: 2) {
                if let sub = booking.subLabel(on: dayKey) {
                    Text(sub).font(.system(size: 9, weight: .bold)).foregroundStyle(.secondary)
                }
                if let t = booking.displayTime(on: dayKey) {
                    Text(WBFormat.time(t)).font(.system(size: 13, weight: .bold)).foregroundStyle(.primary)
                }
                if let cost = booking.cost {
                    Text(WBFormat.money(cost)).font(.system(size: 11, weight: .semibold)).foregroundStyle(accent.opacity(0.9))
                }
            }
        }
    }
}

// MARK: - Map tab

private struct MapTab: View {
    @ObservedObject var store: TripStore
    let trip: Trip
    let accent: Color

    private var pins: [Booking] {
        store.bookings(for: trip.id).filter { $0.mapPlace != nil }
    }

    var body: some View {
        if pins.isEmpty {
            EmptyHint(icon: "mappin.slash", text: "No mapped locations yet.")
        } else {
            VStack(alignment: .leading, spacing: 10) {
                TripMap(pins: pins)
                    .frame(height: 260)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                SectionLabel("\(pins.count) location\(pins.count == 1 ? "" : "s")")
                ForEach(pins) { b in
                    HStack(spacing: 10) {
                        Image(systemName: WB.typeSymbol(b.type)).font(.system(size: 12))
                            .foregroundStyle(WB.typeColor(b.type)).frame(width: 18)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(b.title).font(.system(size: 13, weight: .semibold)).lineLimit(1)
                            if let n = b.mapPlace?.name { Text(n).font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(1) }
                        }
                        Spacer(minLength: 0)
                    }
                }
            }
        }
    }
}

/// SwiftUI map with a marker per booking location.
private struct TripMap: View {
    let pins: [Booking]

    var body: some View {
        Map(initialPosition: .region(region)) {
            ForEach(pins) { b in
                if let p = b.mapPlace {
                    Marker(b.title, systemImage: WB.typeSymbol(b.type), coordinate: p.coordinate)
                        .tint(WB.typeColor(b.type))
                }
            }
        }
    }

    private var region: MKCoordinateRegion {
        let coords = pins.compactMap { $0.mapPlace?.coordinate }
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
        let center = CLLocationCoordinate2D(latitude: (minLat + maxLat) / 2, longitude: (minLon + maxLon) / 2)
        let span = MKCoordinateSpan(latitudeDelta: max((maxLat - minLat) * 1.5, 0.05),
                                    longitudeDelta: max((maxLon - minLon) * 1.5, 0.05))
        return MKCoordinateRegion(center: center, span: span)
    }
}

// MARK: - Budget tab

private struct BudgetTab: View {
    @ObservedObject var store: TripStore
    let trip: Trip
    let accent: Color

    var body: some View {
        if let budget = store.budget(for: trip.id) {
            let cost = Cost(amount: budget.total, currency: budget.currency)
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("TOTAL").font(.system(size: 10, weight: .heavy)).tracking(1).foregroundStyle(.secondary)
                    Text(WBFormat.money(cost)).font(.system(size: 34, weight: .heavy)).foregroundStyle(.primary)
                }
                .frame(maxWidth: .infinity, alignment: .leading).padding(16)
                .background(RoundedRectangle(cornerRadius: 16).fill(accent.opacity(0.16)))

                SectionLabel("By category")
                ForEach(budget.byType, id: \.0) { type, amount in
                    let frac = budget.total > 0 ? amount / budget.total : 0
                    VStack(alignment: .leading, spacing: 5) {
                        HStack {
                            Label(type.rawValue.capitalized, systemImage: WB.typeSymbol(type))
                                .font(.system(size: 13, weight: .semibold)).foregroundStyle(.primary)
                            Spacer()
                            Text(WBFormat.money(Cost(amount: amount, currency: budget.currency)))
                                .font(.system(size: 13, weight: .bold)).foregroundStyle(.secondary)
                        }
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                Capsule().fill(Color(.tertiarySystemFill))
                                Capsule().fill(WB.typeColor(type)).frame(width: max(6, geo.size.width * frac))
                            }
                        }
                        .frame(height: 8)
                    }
                }
            }
        } else {
            EmptyHint(icon: "creditcard", text: "No costs recorded for this trip yet.")
        }
    }
}

// MARK: - Small shared pieces

private struct SectionLabel: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        Text(text.uppercased()).font(.system(size: 11, weight: .heavy)).tracking(1)
            .foregroundStyle(.secondary)
    }
}

private struct EmptyHint: View {
    let icon: String; let text: String
    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: icon).font(.system(size: 28)).foregroundStyle(.tertiary)
            Text(text).font(.system(size: 14)).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 40)
    }
}
