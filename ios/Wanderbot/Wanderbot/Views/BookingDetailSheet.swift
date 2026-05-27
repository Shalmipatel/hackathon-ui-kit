import SwiftUI
import MapKit

/// Full-screen booking detail. Mix of read-only hero + map and
/// editable form rows: timing is editable for everything except
/// flights and hotels (those come from confirmation emails and the
/// agent owns the timestamps); notes are editable for every type.
///
/// `BookingDetailSheet` re-reads the booking from `TravelStore` on
/// every render. SwiftUI's `.sheet(item:)` captures the value at
/// present time and never re-invokes the content closure even when
/// the bound item's fields change — so the parent passes us a stable
/// id and we look up the live booking ourselves. Without this, the
/// "Add time" button would tap-noop because the sheet kept showing
/// the pre-tap (untimed) snapshot.
struct BookingDetailSheet: View {
    /// Used solely for id lookup. The booking displayed in the body
    /// is `liveBooking`, fetched from the store each render so
    /// optimistic updates show immediately.
    let initialBooking: Booking
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: TravelStore

    private var booking: Booking {
        store.bookings.first(where: { $0.id == initialBooking.id }) ?? initialBooking
    }

    private var place: Place? { booking.mapPlace }

    var body: some View {
        let b = booking
        NavigationStack {
            List {
                Section {
                    HeaderRow(booking: b)
                        .listRowInsets(EdgeInsets(top: 12, leading: 14, bottom: 8, trailing: 14))
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                    if let place {
                        MapPreview(place: place, type: b.type)
                            .frame(height: 180)
                            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                            .listRowInsets(EdgeInsets(top: 0, leading: 14, bottom: 8, trailing: 14))
                            .listRowSeparator(.hidden)
                            .listRowBackground(Color.clear)
                    }
                }

                WhenSection(booking: b)
                WhereSection(place: place)
                FlightSection(booking: b)
                DetailsSection(booking: b)
                NotesSection(booking: b)
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Theme.background)
            .navigationTitle(b.type.label)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }.tint(Theme.ink)
                }
            }
        }
    }

    /// UTC calendar used wherever we need to add hours to a date and
    /// have the result stay in our wall-clock convention.
    static let utcCalendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }()
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

/// "When" section. For editable bookings:
///   - no start: "Add time" button (seeds noon UTC on dayKey)
///   - start only: start picker + "Add end time" + "Remove time"
///   - start + end: both pickers + "Remove end time" + "Remove time"
///
/// Both pickers bind through closures that call directly into the
/// store, so the DatePicker value always reflects the current store
/// state — no @State buffers to drift.
///
/// Flights / hotels render read-only with a "comes from confirmation"
/// caption.
private struct WhenSection: View {
    let booking: Booking
    @EnvironmentObject private var store: TravelStore

    private var editable: Bool { store.isTimeEditable(booking) }

    var body: some View {
        Section {
            if editable {
                EditableWhenRows(booking: booking)
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
        let f = DateFormatter()
        f.dateFormat = "EEE, MMM d · h:mm a"
        f.timeZone = TimeZone(identifier: "UTC")
        return f.string(from: date)
    }
}

private struct EditableWhenRows: View {
    let booking: Booking
    @EnvironmentObject private var store: TravelStore

    var body: some View {
        if booking.start == nil {
            Button {
                store.updateStartTime(booking, newStart: defaultNoon())
            } label: {
                Label("Add time", systemImage: "clock")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Theme.ink)
            }
        } else {
            // Direct-binding DatePickers — no local @State so the
            // value always tracks the store, even when the booking
            // changes from outside (SSE sync, another tab, etc.).
            DatePicker(
                "Starts",
                selection: startBinding,
                displayedComponents: [.hourAndMinute]
            )
            .environment(\.timeZone, TimeZone(identifier: "UTC")!)
            .environment(\.calendar, BookingDetailSheet.utcCalendar)

            if booking.end == nil {
                Button {
                    store.updateEndTime(booking, newEnd: defaultEnd())
                } label: {
                    Label("Add end time", systemImage: "clock.badge.checkmark")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(Theme.ink)
                }
            } else {
                DatePicker(
                    "Ends",
                    selection: endBinding,
                    displayedComponents: [.hourAndMinute]
                )
                .environment(\.timeZone, TimeZone(identifier: "UTC")!)
                .environment(\.calendar, BookingDetailSheet.utcCalendar)

                Button(role: .destructive) {
                    store.clearEndTime(booking)
                } label: {
                    Text("Remove end time")
                        .font(.system(size: 14))
                }
            }

            Button(role: .destructive) {
                store.clearStartTime(booking)
            } label: {
                Text("Remove time")
                    .font(.system(size: 14))
            }
        }
    }

    private var startBinding: Binding<Date> {
        Binding(
            get: { booking.start ?? defaultNoon() },
            set: { store.updateStartTime(booking, newStart: $0) }
        )
    }

    private var endBinding: Binding<Date> {
        Binding(
            get: { booking.end ?? defaultEnd() },
            set: { store.updateEndTime(booking, newEnd: $0) }
        )
    }

    /// Noon UTC on the booking's dayKey — seed value when the user
    /// taps "Add time".
    private func defaultNoon() -> Date {
        let base = ISO8601.day(from: booking.dayKey) ?? Date()
        return BookingDetailSheet.utcCalendar.date(byAdding: .hour, value: 12, to: base) ?? base
    }

    /// One hour after the current start — seed value when the user
    /// taps "Add end time".
    private func defaultEnd() -> Date {
        let start = booking.start ?? defaultNoon()
        return BookingDetailSheet.utcCalendar.date(byAdding: .hour, value: 1, to: start) ?? start
    }
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

/// Two-mode notes section:
///   • Read mode (default): renders the body as an AttributedString
///     with detected URLs styled as tappable links. Tapping a link
///     hands off to UIApplication.shared.open via SwiftUI's default
///     OpenURLAction, which opens Safari (no in-app webview).
///   • Edit mode: standard TextEditor with debounced persist.
///
/// We split the modes — instead of bolting tap-to-edit onto a Text
/// — so link taps stay unambiguous; the "Edit" / "Done" toggle in
/// the section header drives mode switching.
private struct NotesSection: View {
    let booking: Booking
    @EnvironmentObject private var store: TravelStore
    @State private var text: String
    @State private var debounceTask: Task<Void, Never>?
    @State private var isEditing: Bool = false
    @FocusState private var focused: Bool

    init(booking: Booking) {
        self.booking = booking
        self._text = State(initialValue: booking.notes ?? "")
    }

    var body: some View {
        Section {
            if isEditing || text.isEmpty {
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
                            if !isFocused {
                                flushSave()
                                /* Only collapse back to read mode when
                                   there's actual content to render —
                                   an empty note has no read view. */
                                if !text.isEmpty { isEditing = false }
                            }
                        }
                        .onAppear {
                            if isEditing { focused = true }
                        }
                }
            } else {
                Text(notesAttributed)
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.ink)
                    .frame(maxWidth: .infinity, alignment: .topLeading)
                    .padding(.vertical, 4)
                    /* `.tint` sets the link colour for the rendered
                       AttributedString. SwiftUI's default OpenURLAction
                       calls UIApplication.shared.open(url) which routes
                       http(s) to Safari (not a webview). Use system
                       blue — it's the universal "this is a link" cue
                       and reads well on the cream background. */
                    .tint(.blue)
                    .textSelection(.enabled)
            }
        } header: {
            HStack {
                Text("Notes")
                Spacer()
                /* Only show the toggle when there's content; the
                   empty-state already uses the editor itself as the
                   tap target via the placeholder. */
                if !text.isEmpty {
                    Button(isEditing ? "Done" : "Edit") {
                        if isEditing {
                            focused = false   // triggers flushSave + mode switch
                        } else {
                            isEditing = true
                            focused = true
                        }
                    }
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Theme.ink)
                    .textCase(nil)
                }
            }
        } footer: {
            Text("Notes sync to every device.")
                .font(.system(size: 11))
                .foregroundStyle(Theme.inkMuted)
        }
    }

    /// Detect URLs in the note body and mark them as `.link` so the
    /// rendered Text routes taps through OpenURLAction → Safari.
    private var notesAttributed: AttributedString {
        var attr = AttributedString(text)
        guard let detector = try? NSDataDetector(
            types: NSTextCheckingResult.CheckingType.link.rawValue
        ) else { return attr }
        let nsRange = NSRange(text.startIndex..<text.endIndex, in: text)
        detector.enumerateMatches(in: text, range: nsRange) { match, _, _ in
            guard let match,
                  let url = match.url,
                  let strRange = Range(match.range, in: text),
                  let lower = AttributedString.Index(strRange.lowerBound, within: attr),
                  let upper = AttributedString.Index(strRange.upperBound, within: attr)
            else { return }
            attr[lower..<upper].link = url
            attr[lower..<upper].underlineStyle = .single
        }
        return attr
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
