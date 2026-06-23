import SwiftUI

/// The Sona companion screen: the real 3D avatar full-bleed on a broken-white
/// background. "Start talking" runs a live voice-to-voice session (like the web);
/// "Text" / the input field open the on-device text conversation.
struct ContentView: View {
    @StateObject private var store = ConversationStore()
    @StateObject private var voice = VoiceSession()
    @State private var draft = ""
    @State private var showChat = false

    private var talkTitle: String {
        switch voice.mode {
        case .idle: return "Start talking"
        case .connecting: return "Connecting…"
        case .listening: return "Listening…"
        case .speaking: return "Sona is speaking…"
        }
    }

    var body: some View {
        ZStack {
            BackgroundScene()

            SonaModelView()
                .ignoresSafeArea()

            VStack(spacing: 0) {
                TopControls(onClose: { voice.stop() })
                    .padding(.top, 4)

                Spacer()

                if let err = voice.error {
                    Text(err)
                        .font(.footnote)
                        .foregroundStyle(.white)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(.red.opacity(0.82), in: Capsule())
                        .padding(.horizontal, 24)
                        .padding(.bottom, 8)
                }

                TalkButton(title: talkTitle, active: voice.mode != .idle) {
                    voice.toggle()
                }
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
