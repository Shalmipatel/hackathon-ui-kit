import SwiftUI
import MapKit

struct BookingDetailSheet: View {
    let booking: Booking
    @Environment(\.dismiss) private var dismiss

    private var place: Place? { booking.mapPlace }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    HeaderRow(booking: booking)

                    if let place {
                        MapPreview(place: place, type: booking.type)
                            .frame(height: 180)
                            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    }

                    if hasTiming {
                        SectionLabel("When")
                        TimingRow(booking: booking)
                    }

                    if let place {
                        SectionLabel("Where")
                        PlaceRow(place: place)
                    }

                    if booking.type == .flight, let from = booking.from, let to = booking.to {
                        SectionLabel("Flight")
                        FlightRow(from: from, to: to, number: booking.flightNumber, cabin: booking.cabin)
                    }

                    if let metaItems, !metaItems.isEmpty {
                        SectionLabel("Details")
                        VStack(spacing: 10) {
                            ForEach(metaItems, id: \.label) { item in
                                MetaRow(label: item.label, value: item.value)
                            }
                        }
                    }

                    if let notes = booking.notes, !notes.isEmpty {
                        SectionLabel("Notes")
                        Text(notes)
                            .font(.system(size: 14))
                            .foregroundStyle(Theme.ink)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(14)
                            .background(
                                RoundedRectangle(cornerRadius: 12, style: .continuous)
                                    .fill(Theme.chipFill)
                            )
                    }
                }
                .padding(16)
            }
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

    private var hasTiming: Bool { booking.start != nil || booking.end != nil }

    private struct MetaItem { let label: String; let value: String }
    private var metaItems: [MetaItem]? {
        var items: [MetaItem] = []
        if let provider = booking.provider { items.append(.init(label: "Provider", value: provider)) }
        if let confirmation = booking.confirmation { items.append(.init(label: "Confirmation", value: confirmation)) }
        if let cost = booking.cost { items.append(.init(label: "Cost", value: WBFormat.money(cost))) }
        if let party = booking.partySize { items.append(.init(label: "Party", value: "\(party)")) }
        if let nights = booking.nights { items.append(.init(label: "Nights", value: "\(nights)")) }
        if let cabin = booking.cabin { items.append(.init(label: "Cabin", value: cabin)) }
        if let mode = booking.mode { items.append(.init(label: "Mode", value: mode)) }
        return items
    }
}

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

private struct SectionLabel: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        Text(text.uppercased())
            .font(.system(size: 11, weight: .bold))
            .tracking(0.10 * 11)
            .foregroundStyle(Theme.inkMuted)
    }
}

private struct TimingRow: View {
    let booking: Booking

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let s = booking.start { Text(detailLine(prefix: "Starts", date: s)) }
            if let e = booking.end { Text(detailLine(prefix: "Ends", date: e)) }
        }
        .font(.system(size: 14))
        .foregroundStyle(Theme.ink)
    }

    private func detailLine(prefix: String, date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "EEE, MMM d · h:mm a"
        return "\(prefix): \(f.string(from: date))"
    }
}

private struct PlaceRow: View {
    let place: Place
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(place.name).font(.system(size: 15, weight: .semibold)).foregroundStyle(Theme.ink)
            if let addr = place.address { Text(addr).font(.system(size: 13)).foregroundStyle(Theme.inkMuted) }
        }
    }
}

private struct FlightRow: View {
    let from: Place
    let to: Place
    let number: String?
    let cabin: String?

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(from.name).font(.system(size: 14, weight: .semibold)).foregroundStyle(Theme.ink)
                if let addr = from.address { Text(addr).font(.system(size: 12)).foregroundStyle(Theme.inkMuted) }
            }
            Image(systemName: "airplane")
                .foregroundStyle(BookingType.flight.accent)
                .padding(.top, 2)
            VStack(alignment: .leading, spacing: 2) {
                Text(to.name).font(.system(size: 14, weight: .semibold)).foregroundStyle(Theme.ink)
                if let addr = to.address { Text(addr).font(.system(size: 12)).foregroundStyle(Theme.inkMuted) }
            }
        }
    }
}

private struct MetaRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label).font(.system(size: 13)).foregroundStyle(Theme.inkMuted)
            Spacer()
            Text(value).font(.system(size: 14, weight: .semibold)).foregroundStyle(Theme.ink)
        }
    }
}

private struct MapPreview: View {
    let place: Place
    let type: BookingType

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
    }
}
