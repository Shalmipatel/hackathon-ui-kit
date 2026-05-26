import Foundation

extension TravelStore {
    @MainActor
    static func sampleStore() -> TravelStore {
        let store = TravelStore()
        store.trips = SampleData.trips
        store.bookings = SampleData.bookings
        store.activeTripId = SampleData.trips.first?.id
        return store
    }
}

enum SampleData {
    private static let cal: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }()

    /// yyyy-MM-dd for `today + offset` days.
    private static func key(_ offset: Int) -> String {
        let base = cal.startOfDay(for: Date())
        let d = cal.date(byAdding: .day, value: offset, to: base) ?? base
        return ISO8601.dayKey(from: d)
    }

    /// Combine a dayKey with hour/minute into a Date (UTC).
    private static func at(_ dayKey: String, _ hour: Int, _ minute: Int = 0) -> Date {
        let base = ISO8601.day(from: dayKey) ?? Date()
        return cal.date(byAdding: DateComponents(hour: hour, minute: minute), to: base) ?? base
    }

    static let trips: [Trip] = [
        Trip(
            id: "trip-tokyo",
            title: "Tokyo Spring",
            destination: "Tokyo, Japan",
            startDate: key(7),
            endDate: key(11),
            color: "#FEEB29",
            travelers: ["Shubh", "Maya"],
            summary: "Five days of ramen, temples, and arcades."
        ),
        Trip(
            id: "trip-lisbon",
            title: "Lisbon Weekend",
            destination: "Lisbon, Portugal",
            startDate: key(21),
            endDate: key(24),
            color: "#F39C6B",
            travelers: ["Shubh"],
            summary: "Long weekend chasing pasteis and ocean views."
        ),
        Trip(
            id: "trip-nyc-past",
            title: "NYC Catch-up",
            destination: "New York, NY",
            startDate: key(-21),
            endDate: key(-18),
            color: "#7C8DA5",
            travelers: ["Shubh"],
            summary: "Old friends, new bagels."
        )
    ]

    // Convenience places
    private static let nrt = Place(name: "Narita International Airport (NRT)", address: "Narita, Chiba", lat: 35.7720, lng: 140.3929)
    private static let sfo = Place(name: "San Francisco International (SFO)", address: "San Francisco, CA", lat: 37.6213, lng: -122.3790)
    private static let parkHyattTokyo = Place(name: "Park Hyatt Tokyo", address: "3-7-1-2 Nishi Shinjuku, Shinjuku", lat: 35.6864, lng: 139.6907)
    private static let sensoji = Place(name: "Sensō-ji Temple", address: "2-3-1 Asakusa, Taitō", lat: 35.7148, lng: 139.7967)
    private static let teamLab = Place(name: "teamLab Planets", address: "6-1-16 Toyosu, Koto", lat: 35.6471, lng: 139.7906)
    private static let ichiranShibuya = Place(name: "Ichiran Shibuya", address: "1-22-7 Jinnan, Shibuya", lat: 35.6620, lng: 139.6987)
    private static let toyosuMarket = Place(name: "Toyosu Market Sushi Dai", address: "6-3-1 Toyosu, Koto", lat: 35.6438, lng: 139.7842)
    private static let shibuyaCrossing = Place(name: "Shibuya Crossing", address: "Shibuya", lat: 35.6595, lng: 139.7005)

    private static let lis = Place(name: "Lisbon Humberto Delgado (LIS)", address: "Lisbon", lat: 38.7813, lng: -9.1359)
    private static let memmoAlfama = Place(name: "Memmo Alfama Hotel", address: "Travessa das Merceeiras 27, Alfama", lat: 38.7117, lng: -9.1310)
    private static let belemTower = Place(name: "Belém Tower", address: "Av. Brasília, Belém", lat: 38.6916, lng: -9.2160)
    private static let timeOutMarket = Place(name: "Time Out Market", address: "Av. 24 de Julho 49", lat: 38.7068, lng: -9.1462)
    private static let tram28 = Place(name: "Tram 28 — Praça Martim Moniz", address: "Praça Martim Moniz", lat: 38.7159, lng: -9.1359)

    private static let jfk = Place(name: "JFK Airport", address: "Queens, NY", lat: 40.6413, lng: -73.7781)
    private static let archerHotel = Place(name: "Archer Hotel NY", address: "45 West 38th St", lat: 40.7530, lng: -73.9849)
    private static let metMuseum = Place(name: "The Met", address: "1000 5th Ave", lat: 40.7794, lng: -73.9632)
    private static let katz = Place(name: "Katz's Delicatessen", address: "205 E Houston St", lat: 40.7223, lng: -73.9874)

    static let bookings: [Booking] = {
        let tokyo = "trip-tokyo"
        let lisbon = "trip-lisbon"
        let nyc = "trip-nyc-past"

        let tk0 = key(7), tk1 = key(8), tk2 = key(9), tk3 = key(10), tk4 = key(11)
        let ls0 = key(21), ls1 = key(22), ls2 = key(23), ls3 = key(24)
        let ny0 = key(-21), ny1 = key(-20), ny3 = key(-18)

        var b: [Booking] = []

        // Tokyo
        b.append(Booking(
            id: "tk-flight-out",
            tripId: tokyo, type: .flight,
            title: "SFO → NRT",
            dayKey: tk0, position: 41400,
            start: at(tk0, 11, 30), end: at(tk0, 15, 45),
            confirmation: "JL7075", provider: "Japan Airlines", source: .email,
            from: sfo, to: nrt, flightNumber: "JL 7075", cabin: "Economy"
        ))
        b.append(Booking(
            id: "tk-hotel",
            tripId: tokyo, type: .hotel,
            title: "Park Hyatt Tokyo", dayKey: tk0, position: 64800,
            start: at(tk0, 18), end: at(tk4, 11),
            confirmation: "ABC-3344", provider: "Park Hyatt", source: .email,
            cost: Cost(amount: 1620, currency: "USD"),
            place: parkHyattTokyo, nights: 4
        ))
        b.append(Booking(
            id: "tk-sensoji",
            tripId: tokyo, type: .attraction,
            title: "Sensō-ji Temple", dayKey: tk1, position: 36000,
            start: at(tk1, 10),
            source: .manual, place: sensoji
        ))
        b.append(Booking(
            id: "tk-ichiran",
            tripId: tokyo, type: .restaurant,
            title: "Lunch at Ichiran", dayKey: tk1, position: 46800,
            start: at(tk1, 13),
            source: .agent, place: ichiranShibuya, partySize: 2
        ))
        b.append(Booking(
            id: "tk-shibuya",
            tripId: tokyo, type: .activity,
            title: "Shibuya Crossing walk", dayKey: tk1, position: 61200,
            start: at(tk1, 17),
            source: .agent, place: shibuyaCrossing
        ))
        b.append(Booking(
            id: "tk-teamlab",
            tripId: tokyo, type: .experience,
            title: "teamLab Planets", dayKey: tk2, position: 39600,
            start: at(tk2, 11), end: at(tk2, 13, 30),
            confirmation: "TL-991", source: .email,
            cost: Cost(amount: 84, currency: "USD"),
            place: teamLab
        ))
        b.append(Booking(
            id: "tk-toyosu",
            tripId: tokyo, type: .restaurant,
            title: "Toyosu Sushi Breakfast", dayKey: tk3, position: 21600,
            start: at(tk3, 6),
            source: .manual, place: toyosuMarket, partySize: 2
        ))
        b.append(Booking(
            id: "tk-flight-back",
            tripId: tokyo, type: .flight,
            title: "NRT → SFO", dayKey: tk4, position: 61200,
            start: at(tk4, 17), end: at(tk4, 11),
            confirmation: "JL7076", provider: "Japan Airlines", source: .email,
            from: nrt, to: sfo, flightNumber: "JL 7076", cabin: "Economy"
        ))

        // Lisbon
        b.append(Booking(
            id: "ls-flight-out",
            tripId: lisbon, type: .flight,
            title: "SFO → LIS", dayKey: ls0, position: 70200,
            start: at(ls0, 19, 30),
            confirmation: "TP206", provider: "TAP Air Portugal", source: .email,
            from: sfo, to: lis, flightNumber: "TP 206"
        ))
        b.append(Booking(
            id: "ls-hotel",
            tripId: lisbon, type: .hotel,
            title: "Memmo Alfama", dayKey: ls1, position: 54000,
            start: at(ls1, 15), end: at(ls3, 11),
            provider: "Memmo", source: .email,
            cost: Cost(amount: 720, currency: "EUR"),
            place: memmoAlfama, nights: 2
        ))
        b.append(Booking(
            id: "ls-tram",
            tripId: lisbon, type: .transport,
            title: "Tram 28 ride", dayKey: ls2, position: 36000,
            start: at(ls2, 10),
            source: .agent, from: tram28, to: tram28, mode: "Tram"
        ))
        b.append(Booking(
            id: "ls-belem",
            tripId: lisbon, type: .attraction,
            title: "Belém Tower", dayKey: ls2, position: 46800,
            start: at(ls2, 13),
            source: .manual, place: belemTower
        ))
        b.append(Booking(
            id: "ls-timeout",
            tripId: lisbon, type: .restaurant,
            title: "Dinner at Time Out Market", dayKey: ls2, position: 68400,
            start: at(ls2, 19),
            source: .manual, place: timeOutMarket, partySize: 1
        ))

        // NYC (past)
        b.append(Booking(
            id: "ny-flight-out",
            tripId: nyc, type: .flight,
            title: "SFO → JFK", dayKey: ny0, position: 28800,
            start: at(ny0, 8),
            provider: "Delta", source: .email,
            from: sfo, to: jfk, flightNumber: "DL 480"
        ))
        b.append(Booking(
            id: "ny-hotel",
            tripId: nyc, type: .hotel,
            title: "Archer Hotel", dayKey: ny0, position: 57600,
            start: at(ny0, 16), end: at(ny3, 11),
            source: .email, place: archerHotel, nights: 3
        ))
        b.append(Booking(
            id: "ny-met",
            tripId: nyc, type: .attraction,
            title: "The Met", dayKey: ny1, position: 36000,
            start: at(ny1, 10),
            source: .manual, place: metMuseum
        ))
        b.append(Booking(
            id: "ny-katz",
            tripId: nyc, type: .restaurant,
            title: "Lunch at Katz's", dayKey: ny1, position: 46800,
            start: at(ny1, 13),
            source: .manual, place: katz, partySize: 2
        ))

        return b
    }()
}
