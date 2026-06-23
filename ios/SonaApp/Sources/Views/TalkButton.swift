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
