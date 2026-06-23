import SwiftUI

/// The bottom input bar: mic / camera / attach, the "Ask Anything" field, and
/// the white "Text" button (from the reference).
struct BottomBar: View {
    @Binding var text: String
    var onSend: () -> Void = {}
    var onText: () -> Void = {}

    var body: some View {
        HStack(spacing: 8) {
            iconCircle("mic.fill")
            iconCircle("video.fill")
            iconCircle("paperclip")

            TextField("", text: $text, prompt: Text("Ask Anything").foregroundColor(.white.opacity(0.7)))
                .textFieldStyle(.plain)
                .foregroundStyle(.white)
                .tint(.white)
                .submitLabel(.send)
                .onSubmit(onSend)
                .padding(.horizontal, 4)

            Button(action: onText) {
                HStack(spacing: 6) {
                    Image(systemName: "bubble.left.fill")
                        .font(.system(size: 13, weight: .bold))
                    Text("Text")
                        .font(.system(size: 15, weight: .semibold))
                }
                .foregroundStyle(.black)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(.white, in: Capsule())
