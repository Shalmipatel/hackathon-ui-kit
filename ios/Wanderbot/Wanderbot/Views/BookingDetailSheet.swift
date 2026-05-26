import SwiftUI
import MapKit

/// Full-screen booking detail. Mix of read-only hero + map and
/// editable form rows: timing is editable for everything except
/// flights and hotels (those come from confirmation emails and the
/// agent owns the timestamps); notes are editable for every type.
struct BookingDetailSheet: View {
    let booking: Booking
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: TravelStore

    private var place: Place? { booking.mapPlace }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HeaderRow(booking: booking)
                        .listRowInsets(EdgeInsets(top: 12, leading: 14, bottom: 8, trailing: 14))
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                    if let place {
                        MapPreview(place: place, type: booking.type)
                            .frame(height: 180)
                            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                            .listRowInsets(EdgeInsets(top: 0, leading: 14, bottom: 8, trailing: 14))
                            .listRowSeparator(.hidden)
                            .listRowBackground(Color.clear)
                    }
                }

                WhenSection(booking: booking)
                WhereSection(place: place)
                FlightSection(booking: booking)
                DetailsSection(booking: booking)
                NotesSection(booking: booking)
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Theme.background)
            .navigationTitle(booking.type.label)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }.tint(Theme.ink)
                }
            }
        }
    }
}

// MARK: - Hero

private struct HeaderRow: View {
    let booking: Booking

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(booking.type.accent.opacity(0.16))
                    .frame(width: 44, height: 44)
                Image(systemName: booking.type.sfSymbol)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(booking.type.accent)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(booking.type.label.uppercased())
                    .font(.system(size: 10.5, weight: .bold))
                    .tracking(0.10 * 10.5)
                    .foregroundStyle(booking.type.accent)
                Text(booking.title)
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(Theme.ink)
            }
            Spacer(minLength: 0)
        }
    }
}

// MARK: - When

/// "When" section. Editable items either show a DatePicker (when a
/// start time is set) or an "Add time" affordance (when untimed).
/// Flights/hotels get a read-only display with a small "locked"
/// caption.
private struct WhenSection: View {
    let booking: Booking
    @EnvironmentObject private var store: TravelStore

    private var editable: Bool { store.isTimeEditable(booking) }

    var body: some View {
        Section {
            if editable {
                if booking.start != nil {
                    EditableTimeRow(booking: booking)
                } else {
                    AddTimeRow(booking: booking)
                }
            } else if booking.start != nil || booking.end != nil {
                if let start = booking.start {
                    InlineDetail(label: "Starts", value: formatted(start))
                }
                if let end = booking.end {
                    InlineDetail(label: "Ends", value: formatted(end))
                }
                Text(booking.type == .flight
                     ? "Times come from the airline confirmation."
                     : "Times come from the hotel confirmation.")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.inkMuted)
            } else {
                Text("No time set")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.inkMuted)
            }
        } header: {
            Text("When")
        }
    }

    private func formatted(_ date: Date) -> String {
        // Wall-clock formatting — date components were stored in UTC
        // so reading back via UTC gives the original hour/minute.
        let f = DateFormatter()
        f.dateFormat = "EEE, MMM d · h:mm a"
        f.timeZone = TimeZone(identifier: "UTC")
        return f.string(from: date)
    }
}

/// One DatePicker bound to the booking's start time. Only rendered
/// when `booking.start != nil`. We use a local @State because
/// DatePicker wants a non-optional Date; the source of truth still
/// lives in the store, and any change flushes via `store.updateTime`
/// which optimistically writes through to RTDB.
private struct EditableTimeRow: View {
    let booking: Booking
    @EnvironmentObject private var store: TravelStore
    @State private var time: Date

    init(booking: Booking) {
        self.booking = booking
        // `start` is guaranteed by WhenSection before rendering us.
        self._time = State(initialValue: booking.start ?? Date())
    }

    var body: some View {
        // Pin the picker's calendar/timezone to UTC. Internally
        // DatePicker uses the environment timezone to render h/m, so
        // without this a 3:00 PM wall-clock value (stored in UTC)
        // would display as 8:00 AM PDT on the picker dial.
        DatePicker("Starts",
                   selection: $time,
                   displayedComponents: [.hourAndMinute])
            .environment(\.timeZone, TimeZone(identifier: "UTC")!)
            .environment(\.calendar, BookingDetailSheet.utcCalendar)
            .onChange(of: time) { _, newValue in
                store.updateTime(booking, newStart: newValue)
            }
        if let end = booking.end {
            // End times stay read-only for now — auto-calculated for
            // multi-day items and not commonly user-edited.
            InlineDetail(label: "Ends", value: humanFormat(end))
        }
        Button("Remove time", role: .destructive) {
            store.clearTime(booking)
        }
        .font(.system(size: 14))
    }

    private func humanFormat(_ date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "EEE, MMM d · h:mm a"
        f.timeZone = TimeZone(identifier: "UTC")
        return f.string(from: date)
    }
}

/// Untimed-booking row. Single "Add time" button that, on tap, seeds
/// the booking with a sensible default (noon on its dayKey). Once a
/// time exists, `WhenSection` swaps in `EditableTimeRow` instead.
private struct AddTimeRow: View {
    let booking: Booking
    @EnvironmentObject private var store: TravelStore

    var body: some View {
        Button {
            store.updateTime(booking, newStart: defaultStart(for: booking))
        } label: {
            HStack {
                Image(systemName: "clock")
                    .font(.system(size: 14, weight: .medium))
                Text("Add time")
                    .font(.system(size: 15, weight: .medium))
                Spacer()
            }
            .foregroundStyle(Theme.ink)
            .padding(.vertical, 2)
        }
        .buttonStyle(.plain)
        .accessibilityHint("Sets the start time to 12:00 PM by default; tap again to adjust.")
    }

    /// Default seed time when the user first taps "Add time": noon
    /// UTC on the booking's dayKey. Picked because (a) it's right in
    /// the middle of a typical itinerary day, and (b) UTC matches
    /// our wall-clock storage convention.
    private func defaultStart(for booking: Booking) -> Date {
        let base = ISO8601.day(from: booking.dayKey) ?? Date()
        return BookingDetailSheet.utcCalendar.date(byAdding: .hour, value: 12, to: base) ?? base
    }
}

extension BookingDetailSheet {
    static let utcCalendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }()
}

// MARK: - Where

private struct WhereSection: View {
    let place: Place?

    var body: some View {
        if let place {
            Section("Where") {
                VStack(alignment: .leading, spacing: 2) {
                    Text(place.name).font(.system(size: 15, weight: .semibold)).foregroundStyle(Theme.ink)
                    if let addr = place.address {
                        Text(addr).font(.system(size: 13)).foregroundStyle(Theme.inkMuted)
                    }
                }
            }
        }
    }
}

// MARK: - Flight

private struct FlightSection: View {
    let booking: Booking

    var body: some View {
        if booking.type == .flight, let from = booking.from, let to = booking.to {
            Section("Flight") {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(from.name).font(.system(size: 14, weight: .semibold)).foregroundStyle(Theme.ink)
                        if let addr = from.address {
                            Text(addr).font(.system(size: 12)).foregroundStyle(Theme.inkMuted)
                        }
                    }
                    Image(systemName: "airplane")
                        .foregroundStyle(BookingType.flight.accent)
                        .padding(.top, 2)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(to.name).font(.system(size: 14, weight: .semibold)).foregroundStyle(Theme.ink)
                        if let addr = to.address {
                            Text(addr).font(.system(size: 12)).foregroundStyle(Theme.inkMuted)
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Details

private struct DetailsSection: View {
    let booking: Booking

    private var items: [(String, String)] {
        var out: [(String, String)] = []
        if let provider = booking.provider { out.append(("Provider", provider)) }
        if let confirmation = booking.confirmation { out.append(("Confirmation", confirmation)) }
        if let cost = booking.cost { out.append(("Cost", WBFormat.money(cost))) }
        if let party = booking.partySize { out.append(("Party", "\(party)")) }
        if let nights = booking.nights { out.append(("Nights", "\(nights)")) }
        if let cabin = booking.cabin { out.append(("Cabin", cabin)) }
        if let mode = booking.mode { out.append(("Mode", mode)) }
        return out
    }

    var body: some View {
        if !items.isEmpty {
            Section("Details") {
                ForEach(items, id: \.0) { row in
                    InlineDetail(label: row.0, value: row.1)
                }
            }
        }
    }
}

private struct InlineDetail: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label).font(.system(size: 14)).foregroundStyle(Theme.inkMuted)
            Spacer()
            Text(value)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Theme.ink)
                .multilineTextAlignment(.trailing)
        }
    }
}

// MARK: - Notes

/// Always-editable notes. We debounce the persist call so a fast
/// typist doesn't slam RTDB with one PATCH per keystroke — the
/// local view updates immediately either way.
private struct NotesSection: View {
    let booking: Booking
    @EnvironmentObject private var store: TravelStore
    @State private var text: String
    @State private var debounceTask: Task<Void, Never>?
    @FocusState private var focused: Bool

    init(booking: Booking) {
        self.booking = booking
        self._text = State(initialValue: booking.notes ?? "")
    }

    var body: some View {
        Section {
            ZStack(alignment: .topLeading) {
                if text.isEmpty {
                    Text("Add a note…")
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.inkMuted)
                        .padding(.top, 8)
                        .padding(.leading, 4)
                        .allowsHitTesting(false)
                }
                TextEditor(text: $text)
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.ink)
                    .frame(minHeight: 80)
                    .focused($focused)
                    .scrollContentBackground(.hidden)
                    .onChange(of: text) { _, _ in scheduleSave() }
                    .onChange(of: focused) { _, isFocused in
                        if !isFocused { flushSave() }
                    }
            }
        } header: {
            Text("Notes")
        } footer: {
            Text("Notes sync to every device.")
                .font(.system(size: 11))
                .foregroundStyle(Theme.inkMuted)
        }
    }

    private func scheduleSave() {
        debounceTask?.cancel()
        debounceTask = Task {
            try? await Task.sleep(nanoseconds: 600_000_000)
            await MainActor.run { flushSave() }
        }
    }

    private func flushSave() {
        debounceTask?.cancel()
        debounceTask = nil
        store.updateNotes(booking, notes: text)
    }
}

// MARK: - Map preview

private struct MapPreview: View {
    let place: Place
    let type: BookingType

    @State private var directionsTarget: Place?

    var body: some View {
        Map(initialPosition: .region(
            MKCoordinateRegion(
                center: place.coordinate,
                span: MKCoordinateSpan(latitudeDelta: 0.01, longitudeDelta: 0.01)
            )
        ), interactionModes: []) {
            Annotation(place.name, coordinate: place.coordinate) {
                ZStack {
                    Circle().fill(type.accent).frame(width: 32, height: 32)
                    Image(systemName: type.sfSymbol)
                        .foregroundStyle(.white)
                        .font(.system(size: 14, weight: .bold))
                }
                .overlay(Circle().stroke(.white, lineWidth: 2))
                .shadow(color: .black.opacity(0.18), radius: 4, y: 2)
            }
        }
        .mapStyle(.standard(pointsOfInterest: .excludingAll))
        // The map has interaction disabled so taps go through the
        // hosting view — opens the directions sheet directly without
        // needing a marker tap to land precisely.
        .contentShape(Rectangle())
        .onTapGesture { directionsTarget = place }
        .directionsConfirmation(for: $directionsTarget)
    }
}
