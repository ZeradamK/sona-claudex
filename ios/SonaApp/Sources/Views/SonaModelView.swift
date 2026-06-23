import SwiftUI
import SceneKit
import GLTFKit2

/// Renders the real Sona 3D avatar (sona.glb) in SceneKit via GLTFKit2.
/// Uses GLTFKit2's own SCNScene directly (reparenting skinned meshes into a
/// fresh scene breaks the skinner → invisible mesh), then frames + lights it.
struct SonaModelView: UIViewRepresentable {
    func makeUIView(context: Context) -> SCNView {
        let view = SCNView()
        view.backgroundColor = .clear
        view.antialiasingMode = .multisampling4X
