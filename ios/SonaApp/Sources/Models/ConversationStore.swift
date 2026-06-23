import Foundation
import SwiftUI

/// Stores the whole conversation in device memory (a JSON file in the app's
/// Documents directory). Survives relaunch. The reply is a local placeholder
/// for now — the real Sona/Gemini backend gets wired in next.
final class ConversationStore: ObservableObject {
    @Published private(set) var messages: [Message] = []

    private let fileURL: URL = {
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        return dir.appendingPathComponent("conversation.json")
    }()

    init() {
        load()
    }

    func load() {
        guard
            let data = try? Data(contentsOf: fileURL),
            let decoded = try? JSONDecoder().decode([Message].self, from: data)
        else { return }
        messages = decoded
    }

    private func persist() {
        guard let data = try? JSONEncoder().encode(messages) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }

    func append(_ message: Message) {
        messages.append(message)
        persist()
    }

    func clear() {
        messages.removeAll()
        persist()
    }

    /// Records the user's line and produces a Sona reply (local placeholder).
    func send(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        append(Message(role: .user, text: trimmed))

        let reply = Self.placeholderReply(to: trimmed)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) { [weak self] in
            self?.append(Message(role: .sona, text: reply))
        }
    }

    private static func placeholderReply(to text: String) -> String {
        "I hear you — “\(text)”. I'm Sona. I'm still getting my voice connected, but I'm here."
    }
}
