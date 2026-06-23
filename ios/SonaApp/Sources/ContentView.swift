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

