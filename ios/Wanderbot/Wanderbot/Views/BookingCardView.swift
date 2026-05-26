import SwiftUI

/// One row in the itinerary. Matches the web mobile layout:
///   [time + sublabel] [icon + title + subtitle] [pills + #conf]
///
/// `dayKey` lets a multi-day booking render the right time / label
/// (Check-in vs Check-out, Departs vs Arrives) on each day it spans.
struct BookingCardView: View {
    let booking: Booking
    /// The day this row is being rendered for. Drives multi-day
    /// labeling (Check-in / Check-out, Departs / Arrives).
    let dayKey: String
    /// True when the row is the only thing keeping the booking on
    /// this day — i.e. not a multi-day span. We hide drag affordance
    /// + show a Locked pill when false.
    let unlocked: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            TimeColumn(booking: booking, dayKey: dayKey)
            BodyColumn(booking: booking)
            Spacer(minLength: 0)
            TailColumn(booking: booking, locked: !unlocked)
        }
        .padding(.vertical, 11)
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
}

// MARK: - Time column

private struct TimeColumn: View {
    let booking: Booking
    let dayKey: String

    var body: some View {
        let time = booking.displayTime(on: dayKey)
        let sub = booking.subLabel(on: dayKey)

        VStack(alignment: .leading, spacing: 1) {
            if let time {
                Text(WBFormat.time(time))
                    .font(.system(size: 13, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(Theme.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
            } else if booking.role(on: dayKey) == .spanMiddle {
                Text("All day")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.ink)
            }
            if let sub {
                Text(sub)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(Theme.inkMuted)
            }
        }
        .frame(width: 64, alignment: .leading)
        .padding(.top, 1)
    }
}

// MARK: - Body column

private struct BodyColumn: View {
    let booking: Booking

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                ZStack {
                    RoundedRectangle(cornerRadius: 9, style: .continuous)
                        .fill(booking.type.iconTileFill)
                        .frame(width: 30, height: 30)
                    Image(systemName: booking.type.sfSymbol)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.ink)
                }
                Text(booking.title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.ink)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }

            if let sub = subtitle, !sub.isEmpty {
                Text(sub)
                    .font(.system(size: 12.5))
                    .foregroundStyle(Theme.inkMuted)
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .padding(.leading, 38)
            }
        }
    }

    private var subtitle: String? {
        switch booking.type {
        case .flight:
            if let f = booking.from?.name, let t = booking.to?.name {
                let route = "\(short(f)) → \(short(t))"
                if let provider = booking.provider, !provider.isEmpty {
                    return "\(provider) · \(route)"
                }
                return route
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
        if let open = name.lastIndex(of: "("),
           let close = name.lastIndex(of: ")"),
           open < close {
            return String(name[name.index(after: open)..<close])
        }
        return name
    }
}

// MARK: - Tail column (locked, source pill, confirmation)

private struct TailColumn: View {
    let booking: Booking
    let locked: Bool

    var body: some View {
        VStack(alignment: .trailing, spacing: 4) {
            if locked {
                HStack(spacing: 3) {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 8, weight: .bold))
                    Text("Locked")
                        .font(.system(size: 10.5, weight: .semibold))
                }
                .foregroundStyle(Theme.inkMuted)
                .padding(.horizontal, 7)
                .padding(.vertical, 2)
                .background(Capsule().fill(Theme.chipFill))
            }

            Text(booking.source.pillLabel.uppercased())
                .font(.system(size: 10, weight: .bold))
                .tracking(0.5)
                .foregroundStyle(booking.source.pillForeground)
                .padding(.horizontal, 7)
                .padding(.vertical, 2)
                .background(Capsule().fill(booking.source.pillBackground))

            if let confirmation = booking.confirmation, !confirmation.isEmpty {
                Text("#\(confirmation)")
                    .font(.system(size: 11))
                    .monospacedDigit()
                    .foregroundStyle(Theme.inkMuted)
                    .lineLimit(1)
            }

            if let cost = booking.cost {
                Text(WBFormat.money(cost))
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Theme.ink.opacity(0.75))
            }
        }
        .layoutPriority(0)
    }
}
