import SwiftUI

/// Top overlay: close button (left) + the tool stack (right) from the reference.
struct TopControls: View {
    var onClose: () -> Void = {}

    var body: some View {
        HStack(alignment: .top) {
            circleButton("xmark", action: onClose)
            Spacer()
            VStack(spacing: 14) {
                circleButton("square.grid.2x2.fill")
                circleButton("viewfinder").opacity(0.55)
                circleButton("hanger").opacity(0.55)
                circleButton("trash").opacity(0.55)
                Image(systemName: "chevron.down")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.7))
                    .padding(.top, 2)
            }
        }
        .padding(.horizontal, 16)
    }

