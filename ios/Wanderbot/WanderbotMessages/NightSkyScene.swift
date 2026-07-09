import SwiftUI

// The brand's illustrated hero scenes — the /og card's eight landscapes,
// drawn live in SwiftUI and picked per trip destination. Zero image assets;
// everything is gradients, Canvas, and Path. All colors pinned — each scene
// carries its own light regardless of the Messages light/dark environment.
//
// Scene geometry is ported from api/og.tsx's SVG builders (viewBox 1200x320
// or 1200x470), normalized to unit coordinates, so the extension hero and
// the chat-bubble PNG stay the same brand world.

// MARK: - RGB helper (iOS 17 has no Color.mix; we lerp components ourselves)

struct WBRGB {
    var r: Double, g: Double, b: Double

    init(_ r: Double, _ g: Double, _ b: Double) { self.r = r; self.g = g; self.b = b }

    /// 0xRRGGBB
    init(hex: UInt32) {
        r = Double((hex >> 16) & 0xFF) / 255
        g = Double((hex >> 8) & 0xFF) / 255
        b = Double(hex & 0xFF) / 255
    }

    /// Parse "#RRGGBB"; nil on anything else.
    init?(hexString: String) {
        var s = hexString.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6, let v = UInt32(s, radix: 16) else { return nil }
        self.init(hex: v)
    }

    func lerp(to other: WBRGB, _ t: Double) -> WBRGB {
        WBRGB(r + (other.r - r) * t, g + (other.g - g) * t, b + (other.b - b) * t)
    }

    var color: Color { Color(red: r, green: g, blue: b) }
}

// MARK: - Night palette (sampled from the og card)

enum WBNight {
    static let nightTop = WBRGB(hex: 0x1A4A56)
    static let nightMid = WBRGB(hex: 0x123540)
    static let nightDeep = WBRGB(hex: 0x0B2029)
    static let nightBase = WBRGB(hex: 0x071820)
    static let ridgeBack = WBRGB(hex: 0x1C3E49)
    static let ridgeMid = WBRGB(hex: 0x14303A)
    static let ridgeFront = WBRGB(hex: 0x0C222B)
    static let snow = WBRGB(hex: 0xB9C4C6)
    static let snowShadow = WBRGB(hex: 0x8FA0A4)
    static let moonCore = WBRGB(hex: 0xF6ECC9)
    static let moonEdge = WBRGB(hex: 0xEEDDA9)
    static let moonCrater = WBRGB(hex: 0xE2D09B)
    static let starCream = WBRGB(hex: 0xF4EFE2)

    static let creamOnNight = Color(red: 0xF4 / 255, green: 0xEF / 255, blue: 0xE2 / 255)
}

// MARK: - Scenes + destination classifier

enum WBScene: String, CaseIterable {
    case mountain, city, coast, desert, forest, snow, aurora, river

    /// Pick the landscape for a trip from its destination/title — mirrors the
    /// classifier in server/card.ts so the chat-bubble PNG and the extension
    /// hero always show the same world. Order matters (aurora before snow so
    /// "Iceland ski trip" gets the ribbons; coast before city so "San Diego"
    /// reads as coastline).
    static func classify(_ text: String) -> WBScene {
        let s = text.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)

        func hit(_ words: [String]) -> Bool { words.contains { s.contains($0) } }

        if hit(["beach", "island", "coast", "maui", "oahu", "kauai", "hawaii", "honolulu",
                "bali", "cancun", "tulum", "cabo", "playa", "miami", "caribbean", "fiji",
                "phuket", "malibu", "san diego", "amalfi", "santorini", "riviera"]) { return .coast }
        if hit(["aurora", "northern lights", "iceland", "reykjavik", "tromso", "alaska",
                "fairbanks", "lofoten", "greenland"]) { return .aurora }
        if hit(["snow", "ski ", "skiing", "aspen", "whistler", "vail", "lapland", "hokkaido",
                "niseko", "antarctica", "arctic", "chamonix"]) { return .snow }
        if hit(["desert", "sahara", "dubai", "abu dhabi", "phoenix", "scottsdale", "sedona",
                "arizona", "moab", "joshua tree", "palm springs", "marrakech", "morocco",
                "atacama", "mojave", "death valley"]) { return .desert }
        if hit(["forest", "jungle", "rainforest", "redwood", "sequoia", "yosemite", "smoky",
                "olympic national", "costa rica", "amazon", "black forest"]) { return .forest }
        if hit(["river", "lake", "laguna", "lagoon", "venice", "amsterdam", "bangkok",
                "atitlan", "como", "bled", "mekong", "danube"]) { return .river }
        if hit(["new york", "nyc", "manhattan", "tokyo", "london", "paris", "chicago",
                "san francisco", "seattle", "berlin", "barcelona", "madrid", "rome", "milan",
                "singapore", "hong kong", "seoul", "toronto", "boston", "austin",
                "las vegas", "vegas", "city"]) { return .city }
        return .mountain
    }

    static func forTrip(_ trip: Trip?) -> WBScene {
        #if DEBUG
        // Screenshot harness: force a scene regardless of destination.
        if let forced = ProcessInfo.processInfo.environment["WB_PREVIEW_SCENE"],
           let s = WBScene(rawValue: forced) { return s }
        #endif
        guard let trip else { return .mountain }
        return classify(trip.destination + " " + trip.title)
    }
}

// MARK: - Deterministic RNG (stable star fields; Date/random-free rendering)

private struct SeededRandom {
    private var state: UInt64

    init(seed string: String) {
        // FNV-1a
        var h: UInt64 = 0xcbf29ce484222325
        for byte in string.utf8 {
            h ^= UInt64(byte)
            h = h &* 0x100000001b3
        }
        state = h == 0 ? 0x9E3779B97F4A7C15 : h
    }

    mutating func next() -> Double {
        state = state &* 6364136223846793005 &+ 1442695040888963407
        return Double(state >> 33) / Double(UInt32.max)
    }
}

// MARK: - Path helpers

/// Closed silhouette from normalized (x, y-from-top) vertices, sealed along
/// the bottom edge — the workhorse for ridges, dunes, and banks.
private struct SilhouetteShape: Shape {
    let points: [(CGFloat, CGFloat)]

    func path(in rect: CGRect) -> Path {
        var p = Path()
        guard let first = points.first else { return p }
        p.move(to: CGPoint(x: first.0 * rect.width, y: first.1 * rect.height))
        for pt in points.dropFirst() {
            p.addLine(to: CGPoint(x: pt.0 * rect.width, y: pt.1 * rect.height))
        }
        p.addLine(to: CGPoint(x: rect.width, y: rect.height))
        p.addLine(to: CGPoint(x: 0, y: rect.height))
        p.closeSubpath()
        return p
    }
}

/// Smooth rolling silhouette (dunes, drifts) from quad-curve segments:
/// (start, [control+end pairs...]), normalized, sealed along the bottom.
private struct RollingShape: Shape {
    let start: (CGFloat, CGFloat)
    let segments: [((CGFloat, CGFloat), (CGFloat, CGFloat))]   // (control, end)

    func path(in rect: CGRect) -> Path {
        func pt(_ p: (CGFloat, CGFloat)) -> CGPoint {
            CGPoint(x: p.0 * rect.width, y: p.1 * rect.height)
        }
        var p = Path()
        p.move(to: CGPoint(x: 0, y: rect.height))
        p.addLine(to: pt(start))
        for (control, end) in segments {
            p.addQuadCurve(to: pt(end), control: pt(control))
        }
        p.addLine(to: CGPoint(x: rect.width, y: rect.height))
        p.closeSubpath()
        return p
    }
}

/// Snowcap polygon anchored to a peak apex (og geometry).
private struct SnowcapShape: Shape {
    let apex: CGPoint
    let scale: CGFloat

    private static let base: [(CGFloat, CGFloat)] = [
        (0.50, 0.42), (0.455, 0.53), (0.475, 0.505),
        (0.495, 0.535), (0.515, 0.505), (0.545, 0.545),
    ]

    func path(in rect: CGRect) -> Path {
        var p = Path()
        let pts = Self.base.map { pt -> CGPoint in
            let dx = (pt.0 - 0.50) * scale
            let dy = (pt.1 - 0.42) * scale
            return CGPoint(x: (apex.x + dx) * rect.width, y: (apex.y + dy) * rect.height)
        }
        p.move(to: pts[0])
        for pt in pts.dropFirst() { p.addLine(to: pt) }
        p.closeSubpath()
        return p
    }
}

private struct SnowcapFacetShape: Shape {
    let apex: CGPoint
    let scale: CGFloat

    private static let base: [(CGFloat, CGFloat)] = [
        (0.50, 0.42), (0.515, 0.505), (0.545, 0.545),
    ]

    func path(in rect: CGRect) -> Path {
        var p = Path()
        let pts = Self.base.map { pt -> CGPoint in
            let dx = (pt.0 - 0.50) * scale
            let dy = (pt.1 - 0.42) * scale
            return CGPoint(x: (apex.x + dx) * rect.width, y: (apex.y + dy) * rect.height)
        }
        p.move(to: pts[0])
        for pt in pts.dropFirst() { p.addLine(to: pt) }
        p.closeSubpath()
        return p
    }
}

// MARK: - The scene view

struct NightSkyScene: View {
    enum Variant { case hero, compact }

    var variant: Variant
    /// Trip accent woven subtly into the sky. Nil = the pure og palette.
    var accent: WBRGB?
    /// Seeds the starfield — every trip gets its own sky.
    var seedID: String
    /// Which brand landscape to draw.
    var scene: WBScene = .mountain
    var showMountains: Bool = true          // false = sky+disc only (loading)
    /// Hero-only: twinkle the feature stars.
    var animated: Bool = false

    // MARK: per-scene styling

    private struct SceneStyle {
        var skyStops: [(WBRGB, CGFloat)]
        var disc: (color: WBRGB, center: UnitPoint, heroDiameter: CGFloat)?
        var discGlow: Bool = true
        var craters: Bool = false
        var starBandHeight: CGFloat = 0.62   // stars only above this fraction
        var starCount: (hero: Int, compact: Int) = (46, 18)
        var scrim: WBRGB
    }

    private var style: SceneStyle {
        switch scene {
        case .mountain:
            return SceneStyle(
                skyStops: [(WBNight.nightTop, 0), (WBNight.nightMid, 0.55), (WBNight.nightDeep, 1)],
                disc: (WBNight.moonCore, UnitPoint(x: 0.62, y: 0.26), 44),
                craters: true,
                scrim: WBNight.nightDeep)
        case .city:
            return SceneStyle(
                skyStops: [(WBRGB(hex: 0x1A1530), 0), (WBRGB(hex: 0x4A3954), 0.5), (WBRGB(hex: 0xC2674E), 1)],
                disc: (WBRGB(hex: 0xF4C074), UnitPoint(x: 0.75, y: 0.62), 40),
                starBandHeight: 0.35,
                starCount: (26, 10),
                scrim: WBRGB(hex: 0x1A1530))
        case .coast:
            return SceneStyle(
                skyStops: [(WBRGB(hex: 0x2A3358), 0), (WBRGB(hex: 0xD4825E), 0.55), (WBRGB(hex: 0xF4C074), 1)],
                disc: (WBRGB(hex: 0xF9D490), UnitPoint(x: 0.50, y: 0.44), 40),
                starBandHeight: 0.28,
                starCount: (20, 8),
                scrim: WBRGB(hex: 0x2A3358))
        case .desert:
            return SceneStyle(
                skyStops: [(WBRGB(hex: 0x7A3A4A), 0), (WBRGB(hex: 0xD97E4A), 0.55), (WBRGB(hex: 0xF4C074), 1)],
                disc: (WBRGB(hex: 0xFAE0A0), UnitPoint(x: 0.67, y: 0.46), 42),
                starBandHeight: 0.25,
                starCount: (16, 6),
                scrim: WBRGB(hex: 0x7A3A4A))
        case .forest:
            return SceneStyle(
                skyStops: [(WBRGB(hex: 0x0E1C1A), 0), (WBRGB(hex: 0x2A4030), 0.6), (WBRGB(hex: 0x587058), 1)],
                disc: (WBRGB(hex: 0xF3E6C2), UnitPoint(x: 0.79, y: 0.28), 34),
                craters: true,
                scrim: WBRGB(hex: 0x0E1C1A))
        case .snow:
            return SceneStyle(
                // og winter palette deepened ~20% so cream type stays legible.
                skyStops: [(WBRGB(hex: 0x2A4058), 0), (WBRGB(hex: 0x5A768E), 0.5), (WBRGB(hex: 0x8BA6BA), 1)],
                disc: nil,
                starBandHeight: 1.0,          // snowflakes fall full-height
                starCount: (54, 22),
                scrim: WBRGB(hex: 0x2A4058))
        case .aurora:
            return SceneStyle(
                skyStops: [(WBRGB(hex: 0x040D1A), 0), (WBRGB(hex: 0x0E1F2E), 0.7), (WBRGB(hex: 0x1E3142), 1)],
                disc: nil,
                starCount: (50, 20),
                scrim: WBRGB(hex: 0x040D1A))
        case .river:
            return SceneStyle(
                skyStops: [(WBRGB(hex: 0x3A2A4E), 0), (WBRGB(hex: 0xC9684C), 0.5), (WBRGB(hex: 0xF4B772), 1)],
                disc: (WBRGB(hex: 0xF9D490), UnitPoint(x: 0.63, y: 0.48), 40),
                starBandHeight: 0.30,
                starCount: (18, 8),
                scrim: WBRGB(hex: 0x3A2A4E))
        }
    }

    private var moonCenter: UnitPoint {
        guard let disc = style.disc else { return UnitPoint(x: 0.65, y: 0.30) }
        // Compact keeps discs clear of the TRIP badge and title block.
        if variant == .compact {
            return UnitPoint(x: min(disc.center.x + 0.05, 0.72), y: max(disc.center.y, 0.30))
        }
        return disc.center
    }
    private var moonDiameter: CGFloat {
        guard let disc = style.disc else { return 0 }
        return variant == .hero ? disc.heroDiameter : disc.heroDiameter * 0.45
    }

    private func lerped(_ base: WBRGB, _ t: Double) -> Color {
        guard let accent else { return base.color }
        return base.lerp(to: accent, t).color
    }

    var body: some View {
        GeometryReader { geo in
            let size = geo.size
            let s = style
            let moonPt = CGPoint(x: moonCenter.x * size.width, y: moonCenter.y * size.height)

            ZStack {
                // L1 — sky (accent woven 12% into every scene's stops)
                LinearGradient(
                    stops: s.skyStops.map { .init(color: lerped($0.0, 0.12), location: $0.1) },
                    startPoint: .top, endPoint: .bottom
                )
                if s.disc != nil {
                    RadialGradient(
                        colors: [Color.white.opacity(0.06), .clear],
                        center: moonCenter, startRadius: 0, endRadius: size.width * 0.55
                    )
                    .blendMode(.screen)
                }

                // L2 — stars (or snowflakes)
                if animated && scene != .snow {
                    TimelineView(.animation(minimumInterval: 0.8)) { context in
                        starsCanvas(size: size, moonPt: moonPt, style: s,
                                    time: context.date.timeIntervalSinceReferenceDate)
                    }
                } else {
                    starsCanvas(size: size, moonPt: moonPt, style: s, time: nil)
                }

                // Aurora ribbons live behind the disc/land, above stars.
                if scene == .aurora { auroraRibbons }

                // L3 — sun/moon disc
                if let disc = s.disc {
                    moon(at: moonPt, core: disc.color, craters: s.craters)
                }

                // L4 — the landscape
                if showMountains {
                    land(in: size)
                }

                // L5 — text scrim (hero only), tuned per scene's darkest tone
                if variant == .hero {
                    LinearGradient(
                        stops: [
                            .init(color: .clear, location: 0.40),
                            .init(color: s.scrim.color.opacity(scene == .snow ? 0.55 : 0.38), location: 1.0),
                        ],
                        startPoint: .top, endPoint: .bottom
                    )
                }
            }
        }
        .clipped()
    }

    // MARK: land dispatch

    @ViewBuilder
    private func land(in size: CGSize) -> some View {
        switch scene {
        case .mountain: mountainLand
        case .city:     cityLand(size)
        case .coast:    coastLand(size)
        case .desert:   desertLand
        case .forest:   forestLand(size)
        case .snow:     snowLand
        case .aurora:   auroraLand
        case .river:    riverLand(size)
        }
    }

    // MARK: mountain (the original)

    private var mountainLand: some View {
        ZStack {
            SilhouetteShape(points: [
                (0, 0.70), (0.16, 0.56), (0.30, 0.66), (0.46, 0.50),
                (0.60, 0.62), (0.74, 0.52), (0.88, 0.62), (1, 0.56),
            ]).fill(lerped(WBNight.ridgeBack, 0.12))

            SilhouetteShape(points: [
                (0, 0.84), (0.20, 0.68), (0.38, 0.78), (0.62, 0.52),
                (0.80, 0.70), (1, 0.64),
            ]).fill(WBNight.ridgeMid.color)

            SnowcapShape(apex: CGPoint(x: 0.62, y: 0.52), scale: 1)
                .fill(WBNight.snow.color)
            SnowcapFacetShape(apex: CGPoint(x: 0.62, y: 0.52), scale: 1)
                .fill(WBNight.snowShadow.color)

            SilhouetteShape(points: [
                (0, 0.94), (0.24, 0.82), (0.46, 0.90), (0.68, 0.78),
                (0.86, 0.88), (1, 0.80),
            ]).fill(WBNight.ridgeFront.color)

            ground(WBNight.nightBase.color)
        }
    }

    // MARK: city (og cityScene — three building depths)

    private func cityLand(_ size: CGSize) -> some View {
        // (x, top-y, width) normalized from the og 1200x320 viewBox; heights
        // run to the bottom. Deterministic subset that reads at both sizes.
        let far: [(CGFloat, CGFloat, CGFloat)] = [
            (0.00, 0.56, 0.05), (0.06, 0.62, 0.033), (0.10, 0.53, 0.066),
            (0.175, 0.61, 0.042), (0.225, 0.50, 0.058), (0.29, 0.58, 0.046),
            (0.83, 0.53, 0.05), (0.89, 0.59, 0.042), (0.94, 0.55, 0.058),
        ]
        let mid: [(CGFloat, CGFloat, CGFloat)] = [
            (0.042, 0.50, 0.05), (0.108, 0.44, 0.042), (0.283, 0.39, 0.066),
            (0.433, 0.45, 0.05), (0.50, 0.375, 0.042), (0.558, 0.48, 0.066),
            (0.642, 0.41, 0.05), (0.775, 0.44, 0.05), (0.842, 0.48, 0.066),
            (0.925, 0.42, 0.042),
        ]
        let front: [(CGFloat, CGFloat, CGFloat)] = [
            (0.017, 0.69, 0.033), (0.067, 0.72, 0.05), (0.133, 0.64, 0.042),
            (0.20, 0.69, 0.05), (0.317, 0.75, 0.046), (0.417, 0.67, 0.05),
            (0.525, 0.75, 0.042), (0.60, 0.69, 0.058), (0.692, 0.66, 0.042),
            (0.783, 0.72, 0.05), (0.875, 0.69, 0.05), (0.942, 0.75, 0.042),
        ]

        func block(_ b: [(CGFloat, CGFloat, CGFloat)], _ color: Color) -> Path {
            var p = Path()
            for (x, top, w) in b {
                p.addRect(CGRect(x: x * size.width, y: top * size.height,
                                 width: w * size.width, height: (1 - top) * size.height))
            }
            return p
        }

        return ZStack {
            block(far, Color(red: 0x3E / 255, green: 0x2A / 255, blue: 0x45 / 255).opacity(0.7))
                .fill(Color(red: 0x3E / 255, green: 0x2A / 255, blue: 0x45 / 255).opacity(0.7))
            // Spired towers in the mid layer (og's pointed buildings)
            SilhouetteShape(points: [(0.165, 1), (0.19, 0.44), (0.215, 0.50), (0.24, 0.44), (0.265, 1)])
                .fill(Color(red: 0x25 / 255, green: 0x1A / 255, blue: 0x30 / 255))
                .frame(height: size.height)
            SilhouetteShape(points: [(0.365, 1), (0.39, 0.31), (0.415, 1)])
                .fill(Color(red: 0x25 / 255, green: 0x1A / 255, blue: 0x30 / 255))
            SilhouetteShape(points: [(0.705, 1), (0.73, 0.28), (0.755, 1)])
                .fill(Color(red: 0x25 / 255, green: 0x1A / 255, blue: 0x30 / 255))
            block(mid, .clear)
                .fill(Color(red: 0x25 / 255, green: 0x1A / 255, blue: 0x30 / 255))
            block(front, .clear)
                .fill(Color(red: 0x10 / 255, green: 0x0A / 255, blue: 0x18 / 255))
            // Seeded lit windows on the front layer
            Canvas { context, canvasSize in
                var rng = SeededRandom(seed: seedID + "windows")
                for (x, top, w) in front {
                    let cols = max(Int(w * 60), 2)
                    let rows = max(Int((1 - top) * 8), 2)
                    for c in 0..<cols {
                        for r in 0..<rows where rng.next() > 0.72 {
                            let wx = (x + w * (0.15 + 0.7 * CGFloat(c) / CGFloat(cols))) * canvasSize.width
                            let wy = (top + (1 - top) * (0.08 + 0.8 * CGFloat(r) / CGFloat(rows))) * canvasSize.height
                            context.fill(Path(CGRect(x: wx, y: wy, width: 1.6, height: 2.4)),
                                         with: .color(Color(red: 0xF4 / 255, green: 0xC0 / 255, blue: 0x74 / 255).opacity(0.35 + rng.next() * 0.4)))
                        }
                    }
                }
            }
        }
    }

    // MARK: coast (og coastScene — sea band, islands, palms)

    private func coastLand(_ size: CGSize) -> some View {
        ZStack {
            // Sea
            LinearGradient(colors: [Color(red: 0x2E / 255, green: 0x64 / 255, blue: 0x78 / 255),
                                    Color(red: 0x10 / 255, green: 0x3A / 255, blue: 0x4E / 255)],
                           startPoint: .top, endPoint: .bottom)
                .frame(height: size.height * 0.30)
                .frame(maxHeight: .infinity, alignment: .bottom)
            // Sun glitter path on the water
            VStack(spacing: size.height * 0.03) {
                ForEach(0..<4, id: \.self) { i in
                    Capsule()
                        .fill(Color(red: 0xF9 / 255, green: 0xD4 / 255, blue: 0x90 / 255)
                            .opacity(0.38 - Double(i) * 0.08))
                        .frame(width: size.width * (0.14 - CGFloat(i) * 0.028),
                               height: max(size.height * 0.012, 2))
                }
            }
            .frame(maxWidth: .infinity)
            .offset(x: size.width * (moonCenter.x - 0.5), y: size.height * 0.30)
            // Distant islands — small bumps sitting right on the horizon line
            SilhouetteShape(points: [(0, 0.70), (0.16, 0.70), (0.23, 0.655), (0.32, 0.70), (1, 0.70)])
                .fill(Color(red: 0x1C / 255, green: 0x36 / 255, blue: 0x40 / 255).opacity(0.6))
                .frame(height: size.height * 0.72)
                .frame(maxHeight: .infinity, alignment: .top)
            SilhouetteShape(points: [(0, 0.70), (0.58, 0.70), (0.68, 0.64), (0.79, 0.70), (1, 0.70)])
                .fill(Color(red: 0x1C / 255, green: 0x36 / 255, blue: 0x40 / 255).opacity(0.6))
                .frame(height: size.height * 0.72)
                .frame(maxHeight: .infinity, alignment: .top)
            // One palm on the right, clear of the title block.
            palm(at: variant == .hero ? 0.86 : 0.84, height: variant == .hero ? 0.60 : 0.66,
                 lean: 1, in: size)
        }
    }

    /// Stylized palm silhouette: curved trunk + drooping fronds (thin,
    /// tapered crescents — reads as a palm crown, not wings).
    private func palm(at x: CGFloat, height h: CGFloat, lean: CGFloat, in size: CGSize) -> some View {
        let ink = Color(red: 0x0A / 255, green: 0x1C / 255, blue: 0x20 / 255)
        let baseX = x * size.width
        let topY = (1 - h) * size.height
        let crown = CGPoint(x: baseX + lean * size.width * 0.012, y: topY)
        return Canvas { context, _ in
            // Trunk — gentle S-curve, slightly tapered
            var trunk = Path()
            trunk.move(to: CGPoint(x: baseX - 2.5, y: size.height))
            trunk.addQuadCurve(to: CGPoint(x: crown.x - 1, y: crown.y),
                               control: CGPoint(x: baseX - lean * size.width * 0.035, y: topY + h * size.height * 0.5))
            trunk.addLine(to: CGPoint(x: crown.x + 1, y: crown.y))
            trunk.addQuadCurve(to: CGPoint(x: baseX + 3.5, y: size.height),
                               control: CGPoint(x: baseX - lean * size.width * 0.028, y: topY + h * size.height * 0.55))
            trunk.closeSubpath()
            context.fill(trunk, with: .color(ink))

            // Fronds — seven thin arcs rising from the crown then drooping.
            // Each is a slim crescent: outer curve up-and-over, inner curve
            // hugging just below it, meeting at the tip.
            let fronds: [(dir: CGFloat, len: CGFloat, droop: CGFloat)] = [
                (-1.0, 0.075, 0.055), (-0.7, 0.09, 0.035), (-0.35, 0.095, 0.012),
                (0.0, 0.02, -0.045),
                (0.35, 0.095, 0.012), (0.7, 0.09, 0.035), (1.0, 0.075, 0.055),
            ]
            for f in fronds {
                let tip = CGPoint(x: crown.x + f.dir * size.width * f.len,
                                  y: crown.y + size.height * f.droop)
                let peak = CGPoint(x: crown.x + f.dir * size.width * f.len * 0.45,
                                   y: crown.y - size.height * 0.045)
                var frond = Path()
                frond.move(to: crown)
                frond.addQuadCurve(to: tip, control: peak)
                frond.addQuadCurve(
                    to: CGPoint(x: crown.x, y: crown.y + 1.5),
                    control: CGPoint(x: crown.x + f.dir * size.width * f.len * 0.45,
                                     y: crown.y - size.height * 0.045 + 3.5))
                frond.closeSubpath()
                context.fill(frond, with: .color(ink))
            }
        }
    }

    // MARK: desert (og desertScene — three rolling dunes)

    private var desertLand: some View {
        ZStack {
            RollingShape(start: (0, 0.78),
                         segments: [((0.25, 0.56), (0.50, 0.72)), ((0.75, 0.875), (1.0, 0.66))])
                .fill(Color(red: 0xC8 / 255, green: 0x7B / 255, blue: 0x48 / 255))
            RollingShape(start: (0, 0.91),
                         segments: [((0.17, 0.69), (0.42, 0.84)), ((0.67, 0.97), (1.0, 0.78))])
                .fill(Color(red: 0xA8 / 255, green: 0x5A / 255, blue: 0x30 / 255))
            RollingShape(start: (0, 0.97),
                         segments: [((0.33, 0.80), (0.67, 0.92)), ((0.83, 0.95), (1.0, 0.875))])
                .fill(Color(red: 0x7A / 255, green: 0x3A / 255, blue: 0x20 / 255))
        }
    }

    // MARK: forest (og forestScene — three procedural pine layers)

    private func forestLand(_ size: CGSize) -> some View {
        Canvas { context, canvasSize in
            func trees(count: Int, baseY: CGFloat, width: CGFloat, minH: CGFloat,
                       stepMod: Int, hRange: CGFloat, color: Color) {
                for i in 0..<count {
                    let x = (CGFloat(i) / CGFloat(count)) * canvasSize.width
                        + canvasSize.width * 0.01
                    let h = (minH + CGFloat((i * stepMod) % 40) / 40 * hRange) * canvasSize.height
                    var tree = Path()
                    tree.move(to: CGPoint(x: x, y: baseY * canvasSize.height))
                    tree.addLine(to: CGPoint(x: x + width * canvasSize.width / 2,
                                             y: baseY * canvasSize.height - h))
                    tree.addLine(to: CGPoint(x: x + width * canvasSize.width,
                                             y: baseY * canvasSize.height))
                    tree.closeSubpath()
                    context.fill(tree, with: .color(color))
                }
            }
            trees(count: 18, baseY: 0.81, width: 0.030, minH: 0.16, stepMod: 13, hRange: 0.12,
                  color: Color(red: 0x1A / 255, green: 0x2C / 255, blue: 0x22 / 255).opacity(0.65))
            trees(count: 14, baseY: 1.0, width: 0.047, minH: 0.25, stepMod: 17, hRange: 0.19,
                  color: Color(red: 0x0E / 255, green: 0x1C / 255, blue: 0x14 / 255))
            trees(count: 10, baseY: 1.0, width: 0.063, minH: 0.41, stepMod: 23, hRange: 0.22,
                  color: Color(red: 0x05 / 255, green: 0x0D / 255, blue: 0x09 / 255))
        }
    }

    // MARK: snow (og snowScene — misty ranges + drifts, flakes instead of stars)

    private var snowLand: some View {
        ZStack {
            SilhouetteShape(points: [
                (0, 0.85), (0.08, 0.68), (0.18, 0.77), (0.29, 0.62), (0.40, 0.77),
                (0.50, 0.66), (0.61, 0.77), (0.71, 0.62), (0.82, 0.77), (0.92, 0.66), (1, 0.77),
            ]).fill(Color(red: 0xA3 / 255, green: 0xB8 / 255, blue: 0xC8 / 255).opacity(0.6))
            SilhouetteShape(points: [
                (0, 0.94), (0.07, 0.72), (0.17, 0.85), (0.27, 0.66), (0.375, 0.85),
                (0.48, 0.72), (0.58, 0.85), (0.69, 0.64), (0.80, 0.85), (0.90, 0.70), (1, 0.85),
            ]).fill(Color(red: 0x7B / 255, green: 0x91 / 255, blue: 0xA4 / 255))
            SnowcapShape(apex: CGPoint(x: 0.27, y: 0.66), scale: 0.7)
                .fill(Color(red: 0xE8 / 255, green: 0xEE / 255, blue: 0xF3 / 255))
            SnowcapShape(apex: CGPoint(x: 0.69, y: 0.64), scale: 0.7)
                .fill(Color(red: 0xE8 / 255, green: 0xEE / 255, blue: 0xF3 / 255))
            RollingShape(start: (0, 0.87),
                         segments: [((0.17, 0.81), (0.33, 0.87)), ((0.50, 0.935), (0.67, 0.85)),
                                    ((0.83, 0.785), (1.0, 0.89))])
                .fill(Color(red: 0xD5 / 255, green: 0xDF / 255, blue: 0xE7 / 255))
            RollingShape(start: (0, 0.935),
                         segments: [((0.25, 0.88), (0.50, 0.935)), ((0.75, 0.98), (1.0, 0.915))])
                .fill(Color(red: 0xEC / 255, green: 0xF0 / 255, blue: 0xF4 / 255))
        }
    }

    // MARK: aurora (og auroraScene — ribbons + dark silhouettes)

    private var auroraRibbons: some View {
        GeometryReader { geo in
            let w = geo.size.width, h = geo.size.height
            ZStack {
                ribbon(points: [(0, 0.17), (0.375, 0.19), (0.79, 0.30), (1.0, 0.21)],
                       thickness: 0.42, w: w, h: h)
                    .fill(LinearGradient(
                        stops: [.init(color: Color(red: 0x2D / 255, green: 0xD3 / 255, blue: 0x88 / 255).opacity(0), location: 0),
                                .init(color: Color(red: 0x2D / 255, green: 0xD3 / 255, blue: 0x88 / 255).opacity(0.5), location: 0.4),
                                .init(color: Color(red: 0x7E / 255, green: 0x3F / 255, blue: 0xC6 / 255).opacity(0), location: 1)],
                        startPoint: .top, endPoint: .bottom))
                ribbon(points: [(0, 0.34), (0.42, 0.38), (0.875, 0.47), (1.0, 0.43)],
                       thickness: 0.30, w: w, h: h)
                    .fill(LinearGradient(
                        stops: [.init(color: Color(red: 0x7E / 255, green: 0x3F / 255, blue: 0xC6 / 255).opacity(0), location: 0),
                                .init(color: Color(red: 0xA8 / 255, green: 0x5A / 255, blue: 0xD2 / 255).opacity(0.4), location: 0.5),
                                .init(color: Color(red: 0x2D / 255, green: 0xD3 / 255, blue: 0x88 / 255).opacity(0), location: 1)],
                        startPoint: .top, endPoint: .bottom))
            }
        }
    }

    private func ribbon(points: [(CGFloat, CGFloat)], thickness: CGFloat,
                        w: CGFloat, h: CGFloat) -> Path {
        var p = Path()
        guard points.count >= 2 else { return p }
        func pt(_ i: Int, _ dy: CGFloat) -> CGPoint {
            CGPoint(x: points[i].0 * w, y: (points[i].1 + dy) * h)
        }
        p.move(to: pt(0, 0))
        for i in 1..<points.count {
            let prev = pt(i - 1, 0), cur = pt(i, 0)
            p.addQuadCurve(to: cur, control: CGPoint(x: (prev.x + cur.x) / 2,
                                                     y: prev.y + (cur.y - prev.y) * 0.2 - h * 0.06))
        }
        for i in stride(from: points.count - 1, through: 0, by: -1) {
            let cur = pt(i, thickness)
            if i == points.count - 1 { p.addLine(to: cur) } else {
                let prev = pt(i + 1, thickness)
                p.addQuadCurve(to: cur, control: CGPoint(x: (prev.x + cur.x) / 2,
                                                         y: prev.y + (cur.y - prev.y) * 0.2 + h * 0.06))
            }
        }
        p.closeSubpath()
        return p
    }

    private var auroraLand: some View {
        ZStack {
            SilhouetteShape(points: [
                (0, 0.90), (0.12, 0.72), (0.27, 0.80), (0.39, 0.66), (0.52, 0.80),
                (0.63, 0.70), (0.76, 0.80), (0.89, 0.68), (1, 0.80),
            ]).fill(Color(red: 0x0A / 255, green: 0x18 / 255, blue: 0x20 / 255))
            SilhouetteShape(points: [
                (0, 0.95), (0.10, 0.88), (0.22, 0.92), (0.32, 0.86), (0.44, 0.92),
                (0.56, 0.88), (0.68, 0.93), (0.80, 0.88), (0.92, 0.92), (1, 0.90),
            ]).fill(Color(red: 0x06 / 255, green: 0x12 / 255, blue: 0x1A / 255))
        }
    }

    // MARK: river (og riverScene — banks, water, reflection, boat)

    private func riverLand(_ size: CGSize) -> some View {
        let bank = Color(red: 0x1A / 255, green: 0x16 / 255, blue: 0x26 / 255)
        return ZStack {
            // Water
            LinearGradient(stops: [
                .init(color: Color(red: 0xC9 / 255, green: 0x68 / 255, blue: 0x4C / 255).opacity(0.55), location: 0),
                .init(color: Color(red: 0x5B / 255, green: 0x3A / 255, blue: 0x4A / 255), location: 0.4),
                .init(color: Color(red: 0x1E / 255, green: 0x22 / 255, blue: 0x35 / 255), location: 1),
            ], startPoint: .top, endPoint: .bottom)
                .frame(height: size.height * 0.36)
                .frame(maxHeight: .infinity, alignment: .bottom)

            // Banks — left pagoda roofs, right modern blocks (both end at waterline .64)
            Canvas { context, canvasSize in
                let W = canvasSize.width, H = canvasSize.height
                func rect(_ x: CGFloat, _ top: CGFloat, _ w: CGFloat) {
                    context.fill(Path(CGRect(x: x * W, y: top * H, width: w * W, height: (0.645 - top) * H)),
                                 with: .color(bank))
                }
                func roof(_ x1: CGFloat, _ apexX: CGFloat, _ x2: CGFloat, _ baseY: CGFloat, _ apexY: CGFloat) {
                    var p = Path()
                    p.move(to: CGPoint(x: x1 * W, y: baseY * H))
                    p.addLine(to: CGPoint(x: apexX * W, y: apexY * H))
                    p.addLine(to: CGPoint(x: x2 * W, y: baseY * H))
                    p.closeSubpath()
                    context.fill(p, with: .color(bank))
                }
                // Left bank (pagodas) — hero drops these: they'd sit right
                // behind the title block. Compact keeps the full og shoreline.
                if variant == .compact {
                    rect(0.05, 0.51, 0.05); roof(0.042, 0.075, 0.108, 0.51, 0.447); roof(0.05, 0.075, 0.10, 0.468, 0.415)
                    rect(0.117, 0.543, 0.042); roof(0.108, 0.1375, 0.167, 0.543, 0.479)
                    rect(0.175, 0.564, 0.05); roof(0.171, 0.20, 0.229, 0.564, 0.521)
                    rect(0.242, 0.553, 0.033)
                    rect(0.283, 0.532, 0.05); roof(0.277, 0.308, 0.34, 0.532, 0.468)
                    rect(0.35, 0.574, 0.033)
                }
                // Right bank (blocks)
                rect(0.683, 0.521, 0.042)
                rect(0.733, 0.468, 0.033)
                rect(0.775, 0.553, 0.046)
                rect(0.829, 0.489, 0.042)
                rect(0.879, 0.532, 0.037)
                rect(0.925, 0.468, 0.033)
                rect(0.967, 0.521, 0.033)
                // Faint reflections under the waterline (left-bank ones only
                // exist where their buildings do — compact)
                let refl = bank.opacity(0.35)
                var reflections: [(Double, Double, Double)] = [
                    (0.683, 0.042, 0.06), (0.733, 0.033, 0.085),
                    (0.829, 0.042, 0.075), (0.925, 0.033, 0.085),
                ]
                if variant == .compact {
                    reflections += [(0.05, 0.05, 0.064), (0.117, 0.042, 0.053)]
                }
                for (x, w, d) in reflections {
                    context.fill(Path(CGRect(x: x * W, y: 0.645 * H, width: w * W, height: d * H)),
                                 with: .color(refl))
                }
                // Boat
                var hull = Path()
                hull.move(to: CGPoint(x: 0.317 * W, y: 0.766 * H))
                hull.addLine(to: CGPoint(x: 0.383 * W, y: 0.766 * H))
                hull.addLine(to: CGPoint(x: 0.375 * W, y: 0.804 * H))
                hull.addLine(to: CGPoint(x: 0.325 * W, y: 0.804 * H))
                hull.closeSubpath()
                context.fill(hull, with: .color(Color(red: 0x0E / 255, green: 0x0A / 255, blue: 0x18 / 255)))
                context.fill(Path(CGRect(x: 0.343 * W, y: 0.734 * H, width: 2, height: 0.043 * H)),
                             with: .color(Color(red: 0x0E / 255, green: 0x0A / 255, blue: 0x18 / 255)))
            }

            // Sun reflection on the water
            VStack(spacing: size.height * 0.035) {
                ForEach(0..<4, id: \.self) { i in
                    Capsule()
                        .fill(Color(red: 0xF9 / 255, green: 0xD4 / 255, blue: 0x90 / 255)
                            .opacity(0.4 - Double(i) * 0.08))
                        .frame(width: size.width * (0.13 - CGFloat(i) * 0.027),
                               height: max(size.height * 0.012, 2))
                }
            }
            .frame(maxWidth: .infinity)
            .offset(x: size.width * (moonCenter.x - 0.5), y: size.height * 0.24)
        }
    }

    private func ground(_ color: Color) -> some View {
        VStack {
            Spacer()
            Rectangle().fill(color).frame(height: 8)
        }
    }

    // MARK: stars / snowflakes

    private func starsCanvas(size: CGSize, moonPt: CGPoint, style s: SceneStyle,
                             time: TimeInterval?) -> some View {
        Canvas { context, canvasSize in
            var rng = SeededRandom(seed: seedID)
            let exclusion = moonDiameter * 1.6
            let count = variant == .hero ? s.starCount.hero : s.starCount.compact
            let isSnowfall = scene == .snow
            for i in 0..<count {
                let x = rng.next() * canvasSize.width
                let y = rng.next() * canvasSize.height * s.starBandHeight
                let radius = isSnowfall ? (1.0 + rng.next() * 1.6) : (0.6 + rng.next() * 0.8)
                var opacity = isSnowfall ? (0.4 + rng.next() * 0.45) : (0.30 + rng.next() * 0.55)

                if s.disc != nil {
                    let dx = x - moonPt.x, dy = y - moonPt.y
                    if (dx * dx + dy * dy).squareRoot() < exclusion { continue }
                }

                let isFeature = !isSnowfall && (i == 7 || i == 19 || i == 33)
                if isFeature, let time {
                    opacity = 0.4 + 0.35 * sin(time * 0.9 + Double(i))
                }

                let rect = CGRect(x: x - radius, y: y - radius, width: radius * 2, height: radius * 2)
                context.fill(Path(ellipseIn: rect), with: .color(WBNight.starCream.color.opacity(opacity)))

                if isFeature {
                    let glint = WBNight.starCream.color.opacity(opacity * 0.5)
                    context.fill(Path(CGRect(x: x - 0.4, y: y - 3.5, width: 0.8, height: 7)), with: .color(glint))
                    context.fill(Path(CGRect(x: x - 3.5, y: y - 0.4, width: 7, height: 0.8)), with: .color(glint))
                }
            }
        }
    }

    // MARK: disc

    @ViewBuilder
    private func moon(at point: CGPoint, core: WBRGB, craters: Bool) -> some View {
        let d = moonDiameter
        let edge = core.lerp(to: WBRGB(hex: 0xE0B980), 0.35)
        ZStack {
            Circle()
                .fill(RadialGradient(colors: [core.color.opacity(0.26), .clear],
                                     center: .center, startRadius: 0, endRadius: d * 1.6))
                .frame(width: d * 3.2, height: d * 3.2)
            Circle()
                .fill(RadialGradient(colors: [core.color.opacity(0.20), .clear],
                                     center: .center, startRadius: 0, endRadius: d * 0.85))
                .frame(width: d * 1.7, height: d * 1.7)
            Circle()
                .fill(RadialGradient(colors: [core.color, edge.color],
                                     center: UnitPoint(x: 0.4, y: 0.4), startRadius: 0, endRadius: d * 0.6))
                .frame(width: d, height: d)
            if craters && variant == .hero {
                Circle().fill(WBNight.moonCrater.color.opacity(0.55))
                    .frame(width: 7, height: 7).offset(x: -9, y: -2)
                Circle().fill(WBNight.moonCrater.color.opacity(0.55))
                    .frame(width: 4.5, height: 4.5).offset(x: 5, y: 8)
            }
        }
        .position(point)
    }
}
