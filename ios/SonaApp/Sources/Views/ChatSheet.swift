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
                }
                inputBar
            }
            .navigationTitle("Sona")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Clear") { store.clear() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private func bubble(_ message: Message) -> some View {
        HStack {
            if message.role == .user { Spacer(minLength: 40) }
            Text(message.text)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(
                    message.role == .user
                        ? AnyShapeStyle(Color.accentColor)
                        : AnyShapeStyle(Color(.secondarySystemBackground)),
                    in: RoundedRectangle(cornerRadius: 18, style: .continuous)
                )
                .foregroundStyle(message.role == .user ? .white : .primary)
            if message.role == .sona { Spacer(minLength: 40) }
