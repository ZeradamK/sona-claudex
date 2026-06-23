import Foundation

enum Role: String, Codable {
    case user
    case sona
}

/// One line of conversation. Persisted to disk (device memory).
struct Message: Identifiable, Codable, Equatable {
    let id: UUID
    let role: Role
    let text: String
    let date: Date

    init(id: UUID = UUID(), role: Role, text: String, date: Date = Date()) {
        self.id = id
        self.role = role
        self.text = text
        self.date = date
    }
}
