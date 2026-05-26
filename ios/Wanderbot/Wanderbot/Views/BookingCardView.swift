import SwiftUI

struct BookingCardView: View {
    let booking: Booking
    /// When true, render the drag handle on the right edge — the
    /// caller adds the actual `.draggable` modifier on the row.
    var isDraggable: Bool = false

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            if booking.start != nil {
                TimeColumn(start: booking.start)
            }
            TypeBadge(type: booking.type)

            VStack(alignment: .leading, spacing: 3) {
                Text(booking.title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)

                if let subtitle {
                    Text(subtitle)
                        .font(.system(size: 12.5))
                        .foregroundStyle(Theme.inkMuted)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }

                HStack(spacing: 8) {
                    if let confirmation = booking.confirmation, !confirmation.isEmpty {
                        InlineChip(text: confirmation, icon: "number")
                    }
                    if let cost = booking.cost {
                        InlineChip(text: WBFormat.money(cost), icon: nil)
                    }
                    if let provider = booking.provider, booking.confirmation == nil {
                        Text(provider)
                            .font(.system(size: 11))
                            .foregroundStyle(Theme.inkMuted)
                    }
                }
                .padding(.top, 2)
            }

            Spacer(minLength: 0)

            if isDraggable {
                Image(systemName: "line.3.horizontal")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.inkMuted)
                    .padding(.leading, 4)
                    .padding(.top, 2)
                    .accessibilityLabel("Drag to reorder")
            }
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous)
                .fill(Theme.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous)
                .strokeBorder(Theme.hairline, lineWidth: 1)
        )
        .contentShape(RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous))
    }

    private var subtitle: String? {
        switch booking.type {
        case .flight:
            if let f = booking.from?.name, let t = booking.to?.name {
                if let no = booking.flightNumber { return "\(no) · \(short(f)) → \(short(t))" }
                return "\(short(f)) → \(short(t))"
            }
            return booking.provider
        case .transport:
            if let f = booking.from?.name, let t = booking.to?.name {
                let mode = booking.mode ?? "Transport"
                if f == t { return mode }
                return "\(mode) · \(short(f)) → \(short(t))"
            }
            return booking.mode
        default:
            return booking.place?.address ?? booking.place?.name
        }
    }

    private func short(_ name: String) -> String {
        // Pull airport code from "Foo Airport (NRT)" if present.
        if let openParen = name.lastIndex(of: "("),
           let closeParen = name.lastIndex(of: ")"),
           openParen < closeParen {
            let code = name[name.index(after: openParen)..<closeParen]
            return String(code)
        }
        return name
    }
}

private struct TimeColumn: View {
    let start: Date?

    var body: some View {
        if let start {
            Text(WBFormat.time(start))
                .font(.system(size: 12, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(Theme.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.85)
                .frame(minWidth: 56, alignment: .trailing)
                .padding(.top, 2)
        }
    }
}

private struct TypeBadge: View {
    let type: BookingType

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(type.accent.opacity(0.14))
                .frame(width: 36, height: 36)
            Image(systemName: type.sfSymbol)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(type.accent)
        }
    }
}

private struct InlineChip: View {
    let text: String
    let icon: String?

    var body: some View {
        HStack(spacing: 4) {
            if let icon {
                Image(systemName: icon)
                    .font(.system(size: 9, weight: .bold))
            }
            Text(text)
                .font(.system(size: 11, weight: .medium))
        }
        .foregroundStyle(Theme.ink.opacity(0.7))
        .padding(.horizontal, 7)
        .padding(.vertical, 3)
        .background(Capsule().fill(Theme.chipFill))
    }
}
