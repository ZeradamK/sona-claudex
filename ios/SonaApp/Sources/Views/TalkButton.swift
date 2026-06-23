import SwiftUI

/// The "Start talking" pill — drives the live voice session.
struct TalkButton: View {
    var title: String = "Start talking"
    var active: Bool = false
    var action: () -> Void = {}

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: active ? "stop.fill" : "waveform")
                    .font(.system(size: 15, weight: .bold))
                Text(title)
                    .font(.system(size: 16, weight: .semibold))
            }
            .foregroundStyle(.black)
            .padding(.horizontal, 22)
            .padding(.vertical, 14)
            .background(.white, in: Capsule())
            .overlay(
                Capsule().stroke(
                    active ? Color.red.opacity(0.6) : Color.black.opacity(0.08),
                    lineWidth: active ? 2 : 1
                )
            )
            .shadow(color: .black.opacity(0.16), radius: 12, y: 4)
        }
    }
}
