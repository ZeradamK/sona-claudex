import SwiftUI

/// Broken-white background, edge to edge.
struct BackgroundScene: View {
    var body: some View {
        Color(red: 0.949, green: 0.941, blue: 0.922)
            .ignoresSafeArea()
    }
}
