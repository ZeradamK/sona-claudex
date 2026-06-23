import Foundation

enum Role: String, Codable {
    case user
    case sona
}

/// One line of conversation. Persisted to disk (device memory).
struct Message: Identifiable, Codable, Equatable {
    let id: UUID
    let role: Role
