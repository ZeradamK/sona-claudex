import SwiftUI

/// The Sona companion screen: the real 3D avatar full-bleed on a broken-white
/// background, with the "Start talking" button and the bottom input bar
/// overlaid. Conversation is stored on-device.
struct ContentView: View {
    @StateObject private var store = ConversationStore()
    @State private var draft = ""
    @State private var showChat = false

    var body: some View {
        ZStack {
            BackgroundScene()

            SonaModelView()
                .ignoresSafeArea()

            VStack(spacing: 0) {
                TopControls(onClose: {})
                    .padding(.top, 4)

                Spacer()

                TalkButton(action: { showChat = true })
                    .padding(.bottom, 12)

                BottomBar(text: $draft, onSend: send, onText: { showChat = true })
                    .padding(.bottom, 4)
            }
        }
        .sheet(isPresented: $showChat) {
            ChatSheet(store: store)
        }
    }

    private func send() {
        store.send(draft)
        draft = ""
        showChat = true
    }
}
