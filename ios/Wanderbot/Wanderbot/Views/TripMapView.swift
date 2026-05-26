import SwiftUI
import MapKit

/// Native MapKit map showing one marker per booking with a place. When
/// `focusedBookingId` changes the camera animates to centre that pin —
/// mirrors the desktop TripMap's behaviour of following the user as
/// they scroll through itinerary cards.
///
/// Tapping a marker opens a confirmation dialog with "Open in Apple
/// Maps" / "Open in Google Maps" so the user can get directions in
/// their preferred app.
struct TripMapView: View {
    let trip: Trip
    let bookings: [Booking]
    let focusedBookingId: Booking.ID?
    let onMarkerTap: (Booking.ID) -> Void

    @State private var cameraPosition: MapCameraPosition = .automatic
    @State private var directionsTarget: Place?

    private var markers: [MapMarkerItem] {
        bookings.compactMap { b in
            guard let place = b.mapPlace else { return nil }
            return MapMarkerItem(id: b.id, type: b.type, title: b.title, place: place)
        }
    }

    var body: some View {
        Map(position: $cameraPosition, interactionModes: [.pan, .zoom]) {
            ForEach(markers) { marker in
                Annotation(marker.title, coordinate: marker.place.coordinate) {
                    Button {
                        // Centre the map on the tapped pin so the
                        // confirmation dialog sits over a useful
                        // backdrop, and then open the dialog.
                        onMarkerTap(marker.id)
                        directionsTarget = marker.place
                    } label: {
                        ZStack {
                            Circle()
                                .fill(marker.type.accent)
                                .frame(width: focusedBookingId == marker.id ? 32 : 26, height: focusedBookingId == marker.id ? 32 : 26)
                                .shadow(color: .black.opacity(0.18), radius: 4, y: 2)
                            Image(systemName: marker.type.sfSymbol)
                                .font(.system(size: focusedBookingId == marker.id ? 14 : 11, weight: .bold))
                                .foregroundStyle(.white)
                        }
                        .overlay(
                            Circle()
                                .stroke(Color.white, lineWidth: 2)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .mapStyle(.standard(elevation: .flat, pointsOfInterest: .excludingAll, showsTraffic: false))
        .onAppear { recenter(animated: false) }
        .onChange(of: focusedBookingId) { _, _ in recenter(animated: true) }
        .onChange(of: trip.id) { _, _ in recenter(animated: false) }
        .directionsConfirmation(for: $directionsTarget)
    }

    private func recenter(animated: Bool) {
        if let focusedId = focusedBookingId,
           let m = markers.first(where: { $0.id == focusedId }) {
            let region = MKCoordinateRegion(
                center: m.place.coordinate,
                span: MKCoordinateSpan(latitudeDelta: 0.02, longitudeDelta: 0.02)
            )
            withAnimation(animated ? .easeInOut(duration: 0.35) : nil) {
                cameraPosition = .region(region)
            }
        } else if markers.count == 1 {
            let region = MKCoordinateRegion(
                center: markers[0].place.coordinate,
                span: MKCoordinateSpan(latitudeDelta: 0.05, longitudeDelta: 0.05)
            )
            cameraPosition = .region(region)
        } else if !markers.isEmpty {
            let rect = boundingRect(for: markers.map(\.place.coordinate))
            cameraPosition = .rect(rect)
        }
    }

    private func boundingRect(for coords: [CLLocationCoordinate2D]) -> MKMapRect {
        var rect = MKMapRect.null
        for coord in coords {
            let point = MKMapPoint(coord)
            let r = MKMapRect(x: point.x, y: point.y, width: 0, height: 0)
            rect = rect.union(r)
        }
        // Pad ~20% on each axis so markers aren't flush with the edge.
        let padX = max(rect.size.width * 0.2, 1500)
        let padY = max(rect.size.height * 0.2, 1500)
        return rect.insetBy(dx: -padX, dy: -padY)
    }
}

private struct MapMarkerItem: Identifiable {
    let id: String
    let type: BookingType
    let title: String
    let place: Place
}
