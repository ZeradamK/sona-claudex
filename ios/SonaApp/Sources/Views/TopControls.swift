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
