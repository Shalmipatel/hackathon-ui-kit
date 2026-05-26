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
}
