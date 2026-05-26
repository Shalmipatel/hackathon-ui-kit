import SwiftUI

enum Theme {
    static let background = Color(red: 0xFB / 255, green: 0xFA / 255, blue: 0xF9 / 255)
    static let surface = Color.white
    static let ink = Color(red: 0x1F / 255, green: 0x24 / 255, blue: 0x21 / 255)
    static let inkDark = Color(red: 0x24 / 255, green: 0x24 / 255, blue: 0x24 / 255)
    static let brandYellow = Color(red: 0xFE / 255, green: 0xEB / 255, blue: 0x29 / 255)
    static let destructive = Color(red: 0xB9 / 255, green: 0x1C / 255, blue: 0x1C / 255)

    static let inkMuted = Color(red: 0x24 / 255, green: 0x24 / 255, blue: 0x24 / 255).opacity(0.55)
    static let inkSubtle = Color(red: 0x24 / 255, green: 0x24 / 255, blue: 0x24 / 255).opacity(0.5)
    static let chipFill = Color(red: 0x24 / 255, green: 0x24 / 255, blue: 0x24 / 255).opacity(0.06)
    static let hairline = Color(red: 0x24 / 255, green: 0x24 / 255, blue: 0x24 / 255).opacity(0.08)

    static let cornerRadius: CGFloat = 14
    static let cardRadius: CGFloat = 16
}

extension Font {
    static let wbTitle = Font.system(size: 16, weight: .semibold)
    static let wbBrand = Font.system(size: 16, weight: .bold)
    static let wbBody = Font.system(size: 15)
    static let wbCaption = Font.system(size: 12)
    static let wbMicro = Font.system(size: 11)
}
