import SwiftUI

/// The text conversation — reads/writes the on-device conversation store.
struct ChatSheet: View {
    @ObservedObject var store: ConversationStore
    @State private var draft = ""
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 10) {
                            if store.messages.isEmpty {
                                Text("Say hello to Sona.")
                                    .foregroundStyle(.secondary)
                                    .padding(.top, 40)
                            }
                            ForEach(store.messages) { message in
                                bubble(message).id(message.id)
                            }
                        }
                        .padding()
                    }
                    .onChange(of: store.messages.count) { _, _ in
                        if let last = store.messages.last {
                            withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                        }
                    }
