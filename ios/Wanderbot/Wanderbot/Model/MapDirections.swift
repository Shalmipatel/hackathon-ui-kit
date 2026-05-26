import Foundation
import UIKit
import MapKit
import SwiftUI

/// Opens a place in the user's chosen maps app. Supports both the
/// "show me the place" intent and the "get me there" intent.
///
/// Google Maps URL patterns are sourced from
/// https://developers.google.com/maps/documentation/urls/ios-urlscheme:
///   - Search for a Place: `comgooglemaps://?q=Pizza&center=lat,lng`
///   - Request Directions: `comgooglemaps://?saddr=Current+Location&daddr=...&directionsmode=driving`
///
/// Each Google action falls back to the universal Google Maps web URL
/// when the app isn't installed, so users without the app still get
/// something useful.
enum MapDirections {
    /// What the user picked from the action sheet.
    enum Action {
        case openInAppleMaps
        case directionsInAppleMaps
        case openInGoogleMaps
        case directionsInGoogleMaps
    }

    /// True only when Google Maps is actually installed. We can only
    /// check this because the bundle's `LSApplicationQueriesSchemes`
    /// includes `comgooglemaps` — without that, canOpenURL would
    /// always return false and we'd label every option as "(web)".
    static var googleMapsInstalled: Bool {
        guard let url = URL(string: "comgooglemaps://") else { return false }
        return UIApplication.shared.canOpenURL(url)
    }

    static func perform(_ action: Action, for place: Place) {
        switch action {
        case .openInAppleMaps: openAppleMaps(place: place, directions: false)
        case .directionsInAppleMaps: openAppleMaps(place: place, directions: true)
        case .openInGoogleMaps: openGoogleMapsView(place: place)
        case .directionsInGoogleMaps: openGoogleMapsDirections(place: place)
        }
    }

    // MARK: - Apple Maps

    private static func openAppleMaps(place: Place, directions: Bool) {
        let coord = CLLocationCoordinate2D(latitude: place.lat, longitude: place.lng)
        let mapItem = MKMapItem(placemark: MKPlacemark(coordinate: coord))
        mapItem.name = place.name
        let options: [String: Any]? = directions
            ? [MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDefault]
            : nil
        mapItem.openInMaps(launchOptions: options)
    }

    // MARK: - Google Maps

    /// "Search for a Place" — `?q=<name>&center=<lat>,<lng>`.
    /// Lands on a labeled pin at the place; user can hit Directions
    /// from there if they want navigation.
    private static func openGoogleMapsView(place: Place) {
        let nameParam = encode(place.name)
        let center = "\(place.lat),\(place.lng)"
        let appURL = URL(string: "comgooglemaps://?q=\(nameParam)&center=\(center)&zoom=15")
        let webURL = URL(string: "https://www.google.com/maps/search/?api=1&query=\(center)&query_place_id=\(nameParam)")
        openPreferringApp(appURL: appURL, webURL: webURL)
    }

    /// "Request Directions" — `?saddr=Current+Location&daddr=<lat>,<lng>&directionsmode=driving`.
    /// Opens Google Maps with driving directions already populated.
    private static func openGoogleMapsDirections(place: Place) {
        let dest = "\(place.lat),\(place.lng)"
        let appURL = URL(string: "comgooglemaps://?saddr=Current+Location&daddr=\(dest)&directionsmode=driving")
        let webURL = URL(string: "https://www.google.com/maps/dir/?api=1&destination=\(dest)&travelmode=driving")
        openPreferringApp(appURL: appURL, webURL: webURL)
    }

    // MARK: - URL helpers

    private static func encode(_ raw: String) -> String {
        raw.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? raw
    }

    private static func openPreferringApp(appURL: URL?, webURL: URL?) {
        if let appURL, UIApplication.shared.canOpenURL(appURL) {
            UIApplication.shared.open(appURL, options: [:], completionHandler: nil)
        } else if let webURL {
            UIApplication.shared.open(webURL, options: [:], completionHandler: nil)
        }
    }
}

/// `.directionsConfirmation(for:)` — attach to any view to drive a
/// confirmation dialog with the four maps actions. Pass a binding
/// the caller sets when the user taps the map; the dialog presents
/// while it's non-nil and clears on dismiss.
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
            Button("Open in Apple Maps") { run(.openInAppleMaps) }
            Button("Directions in Apple Maps") { run(.directionsInAppleMaps) }

            let googleSuffix = MapDirections.googleMapsInstalled ? "" : " (web)"
            Button("Open in Google Maps\(googleSuffix)") { run(.openInGoogleMaps) }
            Button("Directions in Google Maps\(googleSuffix)") { run(.directionsInGoogleMaps) }

            Button("Cancel", role: .cancel) { target = nil }
        } message: {
            if let address = target?.address, !address.isEmpty {
                Text(address)
            }
        }
    }

    private func run(_ action: MapDirections.Action) {
        if let p = target {
            MapDirections.perform(action, for: p)
        }
        target = nil
    }
}

extension View {
    func directionsConfirmation(for target: Binding<Place?>) -> some View {
        modifier(DirectionsConfirmationModifier(target: target))
    }
}
