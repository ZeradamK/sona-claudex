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
        view.autoenablesDefaultLighting = false
        view.rendersContinuously = true
        view.scene = SCNScene()
        load(into: view)
        return view
    }

    func updateUIView(_ uiView: SCNView, context: Context) {}

    private func load(into view: SCNView) {
        guard let url = Bundle.main.url(forResource: "sona", withExtension: "glb") else {
            NSLog("SONA: sona.glb not in bundle"); return
