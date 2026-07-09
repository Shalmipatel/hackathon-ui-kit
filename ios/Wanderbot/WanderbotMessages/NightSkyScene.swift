import SwiftUI

// The brand's night-sky scene — the /og card, drawn live in SwiftUI.
// Deep teal sky, seeded starfield (unique per trip), glowing moon, and three
// faceted mountain ridges with snowcaps. Zero image assets; everything is
// gradients, Canvas, and Path. All colors pinned — the scene carries its own
// light regardless of the Messages light/dark environment.

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

// MARK: - Ridge shapes (faceted, straight segments — the og look)

private struct RidgeShape: Shape {
    /// Normalized (x, y-from-top) vertices, left to right.
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

/// Snowcap polygon: apex → left base → zigzag → apex, all normalized to the
/// scene rect, scalable + movable so multiple peaks can share one definition.
private struct SnowcapShape: Shape {
    let apex: CGPoint          // normalized
    let scale: CGFloat         // 1.0 = the og RidgeMid cap

    // Cap geometry defined around the canonical apex (.50, .42).
    private static let base: [(CGFloat, CGFloat)] = [
        (0.50, 0.42),   // apex
        (0.455, 0.53),  // left base
        (0.475, 0.505),
        (0.495, 0.535),
        (0.515, 0.505),
        (0.545, 0.545),
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

/// The shadowed facet of a snowcap (apex → zig valley → right base).
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

// MARK: - The scene

struct NightSkyScene: View {
    enum Variant { case hero, compact }

    var variant: Variant
    /// Trip accent woven into the sky (18% into gradient stops, 12% into the
    /// back ridge). Nil = the pure og palette.
    var accent: WBRGB?
    /// Seeds the starfield — every trip gets its own sky.
    var seedID: String
    var showMountains: Bool = true
    /// Hero-only: twinkle the three feature stars + drift the moon.
    var animated: Bool = false

    private var skyTop: Color { lerped(WBNight.nightTop, 0.18) }
    private var skyMid: Color { lerped(WBNight.nightMid, 0.18) }
    private var skyDeep: Color { lerped(WBNight.nightDeep, 0.18) }
    private var backRidge: Color { lerped(WBNight.ridgeBack, 0.12) }

    private func lerped(_ base: WBRGB, _ t: Double) -> Color {
        guard let accent else { return base.color }
        return base.lerp(to: accent, t).color
    }

    private var moonCenter: UnitPoint {
        // Compact: clear of the TRIP badge (top-right) and the title block.
        variant == .hero ? UnitPoint(x: 0.62, y: 0.26) : UnitPoint(x: 0.68, y: 0.30)
    }
    private var moonDiameter: CGFloat { variant == .hero ? 44 : 20 }
    private var starCount: Int { variant == .hero ? 46 : 18 }

    var body: some View {
        GeometryReader { geo in
            let size = geo.size
            let moonPt = CGPoint(x: moonCenter.x * size.width, y: moonCenter.y * size.height)

            ZStack {
                // L1 — sky
                LinearGradient(
                    stops: [
                        .init(color: skyTop, location: 0.0),
                        .init(color: skyMid, location: 0.55),
                        .init(color: skyDeep, location: 1.0),
                    ],
                    startPoint: .top, endPoint: .bottom
                )
                RadialGradient(
                    colors: [Color.white.opacity(0.06), .clear],
                    center: moonCenter, startRadius: 0, endRadius: size.width * 0.55
                )
                .blendMode(.screen)

                // L2 — stars
                if animated {
                    TimelineView(.animation(minimumInterval: 0.8)) { context in
                        starsCanvas(size: size, moonPt: moonPt,
                                    time: context.date.timeIntervalSinceReferenceDate)
                    }
                } else {
                    starsCanvas(size: size, moonPt: moonPt, time: nil)
                }

                // L3 — moon
                moon(at: moonPt)

                // L4 — mountains. Kept in the bottom half of the scene so
                // peaks never collide with the hero typography, and the one
                // snowcap is anchored to the mid ridge's tallest apex (its
                // base vertices share the peak's slopes — og style, never a
                // floating chevron). The capped peak sits directly beneath
                // the hero moon for the og composition.
                if showMountains {
                    RidgeShape(points: [
                        (0, 0.70), (0.16, 0.56), (0.30, 0.66), (0.46, 0.50),
                        (0.60, 0.62), (0.74, 0.52), (0.88, 0.62), (1, 0.56),
                    ]).fill(backRidge)

                    RidgeShape(points: [
                        (0, 0.84), (0.20, 0.68), (0.38, 0.78), (0.62, 0.52),
                        (0.80, 0.70), (1, 0.64),
                    ]).fill(WBNight.ridgeMid.color)

                    SnowcapShape(apex: CGPoint(x: 0.62, y: 0.52), scale: 1)
                        .fill(WBNight.snow.color)
                    SnowcapFacetShape(apex: CGPoint(x: 0.62, y: 0.52), scale: 1)
                        .fill(WBNight.snowShadow.color)

                    RidgeShape(points: [
                        (0, 0.94), (0.24, 0.82), (0.46, 0.90), (0.68, 0.78),
                        (0.86, 0.88), (1, 0.80),
                    ]).fill(WBNight.ridgeFront.color)

                    // Ground fill so ridge bases never show a seam.
                    VStack { Spacer(); Rectangle().fill(WBNight.nightBase.color).frame(height: size.height * 0.08) }
                }

                // L5 — text scrim (hero only)
                if variant == .hero {
                    LinearGradient(
                        stops: [
                            .init(color: .clear, location: 0.45),
                            .init(color: WBNight.nightDeep.color.opacity(0.35), location: 1.0),
                        ],
                        startPoint: .top, endPoint: .bottom
                    )
                }
            }
        }
        .clipped()
    }

    // MARK: stars

    private func starsCanvas(size: CGSize, moonPt: CGPoint, time: TimeInterval?) -> some View {
        Canvas { context, canvasSize in
            var rng = SeededRandom(seed: seedID)
            let exclusion = moonDiameter * 1.6
            for i in 0..<starCount {
                let x = rng.next() * canvasSize.width
                let y = rng.next() * canvasSize.height * 0.62
                let radius = 0.6 + rng.next() * 0.8
                var opacity = 0.30 + rng.next() * 0.55

                let dx = x - moonPt.x, dy = y - moonPt.y
                if (dx * dx + dy * dy).squareRoot() < exclusion { continue }

                let isFeature = (i == 7 || i == 19 || i == 33)
                if isFeature, let time {
                    opacity = 0.4 + 0.35 * sin(time * 0.9 + Double(i))
                }

                let rect = CGRect(x: x - radius, y: y - radius, width: radius * 2, height: radius * 2)
                context.fill(Path(ellipseIn: rect), with: .color(WBNight.starCream.color.opacity(opacity)))

                if isFeature {
                    // Cross glint
                    let glint = WBNight.starCream.color.opacity(opacity * 0.5)
                    context.fill(Path(CGRect(x: x - 0.4, y: y - 3.5, width: 0.8, height: 7)), with: .color(glint))
                    context.fill(Path(CGRect(x: x - 3.5, y: y - 0.4, width: 7, height: 0.8)), with: .color(glint))
                }
            }
        }
    }

    // MARK: moon

    @ViewBuilder
    private func moon(at point: CGPoint) -> some View {
        let d = moonDiameter
        ZStack {
            Circle()
                .fill(RadialGradient(colors: [WBNight.moonCore.color.opacity(0.26), .clear],
                                     center: .center, startRadius: 0, endRadius: d * 1.6))
                .frame(width: d * 3.2, height: d * 3.2)
            Circle()
                .fill(RadialGradient(colors: [WBNight.moonCore.color.opacity(0.20), .clear],
                                     center: .center, startRadius: 0, endRadius: d * 0.85))
                .frame(width: d * 1.7, height: d * 1.7)
            Circle()
                .fill(RadialGradient(colors: [WBNight.moonCore.color, WBNight.moonEdge.color],
                                     center: UnitPoint(x: 0.4, y: 0.4), startRadius: 0, endRadius: d * 0.6))
                .frame(width: d, height: d)
            if variant == .hero {
                Circle().fill(WBNight.moonCrater.color.opacity(0.55))
                    .frame(width: 7, height: 7).offset(x: -9, y: -2)
                Circle().fill(WBNight.moonCrater.color.opacity(0.55))
                    .frame(width: 4.5, height: 4.5).offset(x: 5, y: 8)
            }
        }
        .position(point)
    }
}
