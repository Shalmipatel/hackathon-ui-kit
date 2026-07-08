import SwiftUI

/// Declarative card payload carried in the iMessage `MSMessage.url` as a
/// base64url-encoded JSON `p=` query item (the same wire format the Spectrum
/// `customizedMiniApp()` sender writes). The extension ships a fixed, signed
/// renderer that turns this into a native card — no downloaded code.
struct WanderbotCard: Codable {
    var type: String            // trip | hotel | flight | restaurant | attraction | ...
    var title: String
    var subtitle: String?
    /// Extra detail rows shown in the expanded card.
    var lines: [String]?
    /// Hex accent (e.g. "#FEEB29"); falls back to type color.
    var accent: String?
    /// Deep link / path opened in the app when tapped (e.g. "/trip/<id>").
    var href: String?

    static func decode(from url: URL?) -> WanderbotCard? {
        guard let url,
              let comps = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let p = comps.queryItems?.first(where: { $0.name == "p" })?.value
        else { return nil }
        var b64 = p.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while b64.count % 4 != 0 { b64 += "=" }
        guard let data = Data(base64Encoded: b64),
              let card = try? JSONDecoder().decode(WanderbotCard.self, from: data)
        else { return nil }
        return card
    }
}

/// SF Symbol + color per booking/trip type (mirrors the app's booking accents).
enum CardStyle {
    static func symbol(_ type: String) -> String {
        switch type {
        case "trip": return "suitcase.fill"
        case "flight": return "airplane"
        case "hotel": return "bed.double.fill"
        case "restaurant": return "fork.knife"
        case "attraction": return "camera.fill"
        case "experience": return "sparkles"
        case "event": return "ticket.fill"
        case "transport": return "tram.fill"
        default: return "mappin.circle.fill"
        }
    }

    static func color(_ card: WanderbotCard) -> Color {
        if let hex = card.accent, let c = Color(hex: hex) { return c }
        switch card.type {
        case "flight": return Color(red: 0.56, green: 0.72, blue: 0.91)
        case "hotel": return Color(red: 0.99, green: 0.92, blue: 0.16)
        case "restaurant": return Color(red: 0.95, green: 0.61, blue: 0.42)
        case "attraction", "experience": return Color(red: 0.78, green: 0.66, blue: 0.91)
        default: return Color(red: 0.49, green: 0.77, blue: 0.63)
        }
    }
}

/// The native card. `compact` is the small in-transcript bubble; the full form
/// is shown when the user expands the app.
struct WanderbotCardView: View {
    let card: WanderbotCard
    var compact: Bool = false

    var body: some View {
        let accent = CardStyle.color(card)
        VStack(alignment: .leading, spacing: compact ? 6 : 12) {
            HStack(spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12, style: .continuous).fill(accent.opacity(0.22))
                    Image(systemName: CardStyle.symbol(card.type))
                        .font(.system(size: compact ? 18 : 24, weight: .semibold))
                        .foregroundStyle(accent)
                }
                .frame(width: compact ? 40 : 54, height: compact ? 40 : 54)

                VStack(alignment: .leading, spacing: 2) {
                    Text(card.title)
                        .font(.system(size: compact ? 15 : 20, weight: .bold))
                        .lineLimit(compact ? 1 : 2)
                        .foregroundStyle(.primary)
                    if let s = card.subtitle, !s.isEmpty {
                        Text(s)
                            .font(.system(size: compact ? 12 : 14))
                            .foregroundStyle(.secondary)
                            .lineLimit(compact ? 1 : 2)
                    }
                }
                Spacer(minLength: 0)
            }

            if !compact, let lines = card.lines, !lines.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                        HStack(alignment: .top, spacing: 8) {
                            Circle().fill(accent).frame(width: 6, height: 6).padding(.top, 6)
                            Text(line).font(.system(size: 14)).foregroundStyle(.primary)
                            Spacer(minLength: 0)
                        }
                    }
                }
                .padding(.top, 2)

                HStack(spacing: 6) {
                    Image(systemName: "paperplane.fill").font(.system(size: 11))
                    Text("Open in Wanderbot").font(.system(size: 13, weight: .semibold))
                }
                .foregroundStyle(accent)
                .padding(.top, 2)
            }
        }
        .padding(compact ? 12 : 18)
        .background(
            RoundedRectangle(cornerRadius: compact ? 16 : 22, style: .continuous)
                .fill(Color(.secondarySystemBackground))
        )
        .overlay(
            RoundedRectangle(cornerRadius: compact ? 16 : 22, style: .continuous)
                .stroke(accent.opacity(0.35), lineWidth: 1)
        )
        .padding(compact ? 8 : 16)
    }
}

extension Color {
    init?(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6, let v = UInt64(s, radix: 16) else { return nil }
        self.init(
            red: Double((v >> 16) & 0xFF) / 255,
            green: Double((v >> 8) & 0xFF) / 255,
            blue: Double(v & 0xFF) / 255
        )
    }
}
