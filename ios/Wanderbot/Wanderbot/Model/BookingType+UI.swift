import SwiftUI

extension BookingType {
    var sfSymbol: String {
        switch self {
        case .flight: return "airplane"
        case .hotel: return "bed.double.fill"
        case .restaurant: return "fork.knife"
        case .attraction: return "building.columns.fill"
        case .experience: return "sparkles"
        case .event: return "ticket.fill"
        case .activity: return "figure.walk"
        case .transport: return "tram.fill"
        }
    }

    var label: String {
        switch self {
        case .flight: return "Flight"
        case .hotel: return "Hotel"
        case .restaurant: return "Restaurant"
        case .attraction: return "Attraction"
        case .experience: return "Experience"
        case .event: return "Event"
        case .activity: return "Activity"
        case .transport: return "Transport"
        }
    }

    var accent: Color {
        switch self {
        case .flight: return Color(red: 0.20, green: 0.46, blue: 0.86)
        case .hotel: return Color(red: 0.55, green: 0.34, blue: 0.80)
        case .restaurant: return Color(red: 0.93, green: 0.45, blue: 0.20)
        case .attraction: return Color(red: 0.18, green: 0.62, blue: 0.55)
        case .experience: return Color(red: 0.94, green: 0.62, blue: 0.20)
        case .event: return Color(red: 0.86, green: 0.22, blue: 0.49)
        case .activity: return Color(red: 0.36, green: 0.70, blue: 0.36)
        case .transport: return Color(red: 0.42, green: 0.46, blue: 0.55)
        }
    }

    /// Web parity (TONE_BG in BookingCard.tsx). Translucent fills used
    /// for the small icon tile in the row body.
    var iconTileFill: Color {
        switch self {
        case .flight:     return Color(red: 56/255, green: 189/255, blue: 248/255).opacity(0.18)
        case .hotel:      return Color(red: 250/255, green: 204/255, blue:  21/255).opacity(0.22)
        case .attraction: return Color(red: 217/255, green: 119/255, blue:   6/255).opacity(0.18)
        case .experience: return Color(red:  20/255, green: 184/255, blue: 166/255).opacity(0.18)
        case .event:      return Color(red: 236/255, green:  72/255, blue: 153/255).opacity(0.18)
        case .activity:   return Color(red: 168/255, green:  85/255, blue: 247/255).opacity(0.18)
        case .restaurant: return Color(red: 248/255, green: 113/255, blue: 113/255).opacity(0.18)
        case .transport:  return Color(red:  73/255, green: 160/255, blue: 120/255).opacity(0.18)
        }
    }
}

extension BookingSource {
    /// Web parity for the source pill. email = highlighted yellow,
    /// agent = indigo, manual = neutral.
    var pillBackground: Color {
        switch self {
        case .email:  return Color(red: 254/255, green: 235/255, blue: 41/255).opacity(0.55)
        case .agent:  return Color(red:  99/255, green: 102/255, blue: 241/255).opacity(0.12)
        case .manual: return Color(red:  36/255, green:  36/255, blue:  36/255).opacity(0.06)
        }
    }

    var pillForeground: Color {
        switch self {
        case .email:  return Color(red: 0x5a/255, green: 0x4a/255, blue: 0)
        case .agent:  return Color(red: 0x37/255, green: 0x30/255, blue: 0xa3/255)
        case .manual: return Color(red: 36/255, green: 36/255, blue: 36/255).opacity(0.75)
        }
    }

    var pillLabel: String {
        switch self {
        case .email: return "From email"
        case .agent: return "Agent"
        case .manual: return "Manual"
        }
    }
}
