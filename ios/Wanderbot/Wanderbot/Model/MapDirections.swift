import Foundation
import UIKit
import MapKit

/// Opens a place in the user's chosen maps app. Both deep links are
/// "show this pin" style — we don't pre-pick driving / walking, so the
/// destination app's default mode is what the user sees.
enum MapDirections {
    enum Provider { case appleMaps, googleMaps }

    /// True only when Google Maps is actually installed. We can only
    /// check this because the bundle's `LSApplicationQueriesSchemes`
    /// includes `comgooglemaps` — without that, canOpenURL always
    /// returns false and we'd hide the option for everyone.
    static var googleMapsInstalled: Bool {
        guard let url = URL(string: "comgooglemaps://") else { return false }
        return UIApplication.shared.canOpenURL(url)
    }

    /// Open the place in the chosen provider. For Google Maps we try
    /// the app deep link first and fall back to the https page so a
    /// user without the app still gets a useful result.
    static func open(place: Place, in provider: Provider) {
        switch provider {
        case .appleMaps:
            openAppleMaps(place: place)
        case .googleMaps:
            openGoogleMaps(place: place)
        }
    }

    private static func openAppleMaps(place: Place) {
        // MKMapItem is the official "show this pin" API. Passing nil
        // launchOptions lets Maps choose the default (just shows the
        // pin instead of routing).
        let coord = CLLocationCoordinate2D(latitude: place.lat, longitude: place.lng)
        let placemark = MKPlacemark(coordinate: coord)
        let mapItem = MKMapItem(placemark: placemark)
        mapItem.name = place.name
        mapItem.openInMaps()
    }

    private static func openGoogleMaps(place: Place) {
        let nameParam = place.name.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? place.name
        let appURL = URL(string: "comgooglemaps://?q=\(nameParam)&center=\(place.lat),\(place.lng)&zoom=15")
        let webURL = URL(string: "https://www.google.com/maps/search/?api=1&query=\(place.lat),\(place.lng)&query_place_id=\(nameParam)")

        if let appURL, UIApplication.shared.canOpenURL(appURL) {
            UIApplication.shared.open(appURL, options: [:], completionHandler: nil)
        } else if let webURL {
            UIApplication.shared.open(webURL, options: [:], completionHandler: nil)
        }
    }
}

import SwiftUI

/// `.directionsConfirmation(for:)` — attach to any view to drive a
/// confirmation dialog with "Open in Apple Maps" / "Open in Google
/// Maps". Pass a binding that the caller sets when the user taps the
/// map; the dialog presents while it's non-nil and clears on dismiss.
struct DirectionsConfirmationModifier: ViewModifier {
    @Binding var target: Place?

    func body(content: Content) -> some View {
        content.confirmationDialog(
            target?.name ?? "",
            isPresented: Binding(
                get: { target != nil },
                set: { isPresented in if !isPresented { target = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Open in Apple Maps") {
                if let p = target {
                    MapDirections.open(place: p, in: .appleMaps)
                }
                target = nil
            }
            Button(MapDirections.googleMapsInstalled
                   ? "Open in Google Maps"
                   : "Open in Google Maps (web)") {
                if let p = target {
                    MapDirections.open(place: p, in: .googleMaps)
                }
                target = nil
            }
            Button("Cancel", role: .cancel) { target = nil }
        } message: {
            if let address = target?.address, !address.isEmpty {
                Text(address)
            }
        }
    }
}

extension View {
    func directionsConfirmation(for target: Binding<Place?>) -> some View {
        modifier(DirectionsConfirmationModifier(target: target))
    }
}
