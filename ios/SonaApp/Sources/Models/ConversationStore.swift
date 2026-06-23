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
