import SwiftUI
import MapKit

/// Replaces the TripMapView when the currently-focused booking is a
/// flight. Two halves:
///   - Top: airline + flight code, route summary, times
///   - Bottom: MapKit map with a great-circle (geodesic) arc between
///     origin and destination — the same shape Apple uses for flight
///     status visualizations in iMessage / Apple Maps.
///
/// iOS doesn't expose a public flight-tracking API, so live status
/// (gate, delay, on-time %) isn't available. What we *can* render
/// natively is the route geometry — and MapKit's `MKGeodesicPolyline`
/// makes that look right.
struct FlightHeaderView: View {
    let booking: Booking

    var body: some View {
        ZStack {
            if let from = booking.from, let to = booking.to {
                GeodesicMap(from: from, to: to)
                    .ignoresSafeArea(edges: .horizontal)
            } else {
                Color(red: 0.93, green: 0.95, blue: 0.98)
            }

            VStack(spacing: 0) {
                FlightInfoBar(booking: booking)
                Spacer(minLength: 0)
            }
        }
    }
}

private struct FlightInfoBar: View {
    let booking: Booking

    private var fromCode: String { airportCode(booking.from?.name ?? "") }
    private var toCode: String { airportCode(booking.to?.name ?? "") }

    var body: some View {
        VStack(spacing: 6) {
            HStack(spacing: 12) {
                LegEnd(code: fromCode, time: booking.start, label: "Depart")
                FlightConnector(provider: booking.provider, number: booking.flightNumber)
                LegEnd(code: toCode, time: booking.end, label: "Arrive", trailing: true)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(
                Theme.surface.opacity(0.96)
                    .background(.ultraThinMaterial)
            )
            .overlay(alignment: .bottom) {
                Rectangle().fill(Theme.hairline).frame(height: 0.5)
            }
        }
    }

    private func airportCode(_ raw: String) -> String {
        if let open = raw.lastIndex(of: "("),
           let close = raw.lastIndex(of: ")"),
           open < close {
            return String(raw[raw.index(after: open)..<close])
        }
        let words = raw.split(separator: " ")
        if let first = words.first, first.count == 3 { return String(first).uppercased() }
        return String(raw.prefix(3)).uppercased()
    }
}

private struct LegEnd: View {
    let code: String
    let time: Date?
    let label: String
    var trailing: Bool = false

    var body: some View {
        VStack(alignment: trailing ? .trailing : .leading, spacing: 2) {
            Text(code)
                .font(.system(size: 22, weight: .bold, design: .rounded))
                .foregroundStyle(Theme.ink)
                .tracking(0.5)
            Text(label.uppercased())
                .font(.system(size: 9, weight: .bold))
                .tracking(0.10 * 9)
                .foregroundStyle(Theme.inkMuted)
            if let time {
                Text(WBFormat.time(time))
                    .font(.system(size: 11, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(Theme.ink)
            }
        }
        .frame(maxWidth: .infinity, alignment: trailing ? .trailing : .leading)
    }
}

private struct FlightConnector: View {
    let provider: String?
    let number: String?

    var body: some View {
        VStack(spacing: 2) {
            Image(systemName: "airplane")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(BookingType.flight.accent)
                .rotationEffect(.degrees(90))
            if let number, !number.isEmpty {
                Text(number)
                    .font(.system(size: 10.5, weight: .semibold))
                    .foregroundStyle(Theme.ink)
            } else if let provider {
                Text(provider)
                    .font(.system(size: 10.5, weight: .semibold))
                    .foregroundStyle(Theme.ink)
            }
        }
        .frame(maxWidth: 80)
    }
}

/// MapKit map with a geodesic line from origin to destination. The
/// camera frames both endpoints with padding so the arc is centred.
private struct GeodesicMap: UIViewRepresentable {
    let from: Place
    let to: Place

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> MKMapView {
        let map = MKMapView()
        map.delegate = context.coordinator
        map.isZoomEnabled = false
        map.isScrollEnabled = false
        map.isRotateEnabled = false
        map.isPitchEnabled = false
        map.pointOfInterestFilter = .excludingAll
        map.showsCompass = false
        map.showsScale = false
        map.showsUserLocation = false
        return map
    }

    func updateUIView(_ map: MKMapView, context: Context) {
        map.removeOverlays(map.overlays)
        map.removeAnnotations(map.annotations)

        let coords = [from.coordinate, to.coordinate]
        let line = MKGeodesicPolyline(coordinates: coords, count: coords.count)
        map.addOverlay(line)

        for (place, kind) in [(from, "depart"), (to, "arrive")] {
            let pin = AirportAnnotation()
            pin.coordinate = place.coordinate
            pin.title = place.name
            pin.kind = kind
            map.addAnnotation(pin)
        }

        // Frame both endpoints with edge padding so the arc breathes.
        var rect = MKMapRect.null
        for c in coords {
            let p = MKMapPoint(c)
            rect = rect.union(MKMapRect(x: p.x, y: p.y, width: 0, height: 0))
        }
        let padding = UIEdgeInsets(top: 60, left: 60, bottom: 30, right: 60)
        map.setVisibleMapRect(rect, edgePadding: padding, animated: false)
    }

    final class Coordinator: NSObject, MKMapViewDelegate {
        func mapView(_ map: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            if let line = overlay as? MKGeodesicPolyline {
                let renderer = MKPolylineRenderer(polyline: line)
                renderer.strokeColor = UIColor(BookingType.flight.accent)
                renderer.lineWidth = 3
                renderer.lineDashPattern = [6, 4]
                renderer.lineCap = .round
                return renderer
            }
            return MKOverlayRenderer(overlay: overlay)
        }

        func mapView(_ map: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
            guard let pin = annotation as? AirportAnnotation else { return nil }
            let id = "airport"
            let view = MKAnnotationView(annotation: pin, reuseIdentifier: id)
            view.canShowCallout = false
            let symbolName = pin.kind == "depart" ? "airplane.departure" : "airplane.arrival"
            let host = UIHostingController(rootView: AirportBadge(symbol: symbolName))
            host.view.backgroundColor = .clear
            host.view.frame = CGRect(x: 0, y: 0, width: 32, height: 32)
            view.frame = host.view.frame
            view.addSubview(host.view)
            return view
        }
    }
}

private final class AirportAnnotation: MKPointAnnotation {
    var kind: String = "depart"
}

private struct AirportBadge: View {
    let symbol: String

    var body: some View {
        ZStack {
            Circle().fill(BookingType.flight.accent)
            Image(systemName: symbol)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(.white)
        }
        .frame(width: 28, height: 28)
        .overlay(Circle().stroke(.white, lineWidth: 2))
        .shadow(color: .black.opacity(0.18), radius: 3, y: 1)
    }
}
