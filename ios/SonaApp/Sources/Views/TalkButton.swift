import SwiftUI

/// The amber "Start talking" pill above the input bar.
struct TalkButton: View {
    var action: () -> Void = {}

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: "waveform")
                    .font(.system(size: 15, weight: .bold))
                Text("Start talking")
                    .font(.system(size: 16, weight: .semibold))
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 22)
            .padding(.vertical, 14)
            .background(
                LinearGradient(
                    colors: [Color(red: 1, green: 0.66, blue: 0.26),
                             Color(red: 0.97, green: 0.51, blue: 0.17)],
                    startPoint: .top, endPoint: .bottom
                ),
                in: Capsule()
            )
            .shadow(color: .orange.opacity(0.45), radius: 14, y: 5)
        }
    }
}
