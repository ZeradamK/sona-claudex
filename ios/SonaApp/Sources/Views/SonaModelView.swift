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
        }
        GLTFAsset.load(with: url, options: [:]) { _, status, maybeAsset, error, _ in
            if let error = error { NSLog("SONA load error: %@", String(describing: error)) }
            guard status == .complete, let asset = maybeAsset else { return }
            let source = GLTFSCNSceneSource(asset: asset)
            guard let modelScene = source.defaultScene ?? source.scenes.first else {
                NSLog("SONA: no scene"); return
            }
            DispatchQueue.main.async {
                view.scene = modelScene
                let modelNodes = modelScene.rootNode.childNodes
                addLighting(to: modelScene)
                frameCamera(on: modelScene, view: view)
                for node in modelNodes { idleSway(node) }
            }
        }
    }

    // MARK: Lighting

    private func addLighting(to scene: SCNScene) {
        scene.lightingEnvironment.contents = UIColor(white: 0.95, alpha: 1)
        scene.lightingEnvironment.intensity = 1.6

        let key = SCNNode()
        key.light = SCNLight()
        key.light?.type = .directional
        key.light?.intensity = 800
        key.eulerAngles = SCNVector3(-0.5, 0.5, 0)
        scene.rootNode.addChildNode(key)

        let ambient = SCNNode()
        ambient.light = SCNLight()
        ambient.light?.type = .ambient
        ambient.light?.intensity = 350
        scene.rootNode.addChildNode(ambient)
    }

    // MARK: Framing

    private func frameCamera(on scene: SCNScene, view: SCNView) {
        let (minV, maxV) = combinedBounds(scene.rootNode)
        let valid = maxV.y > minV.y && maxV.y < 1e8
        let center = valid
            ? SCNVector3((minV.x + maxV.x) / 2, (minV.y + maxV.y) / 2, (minV.z + maxV.z) / 2)
            : SCNVector3(0, 0.9, 0)
        let height = valid ? max(maxV.y - minV.y, 0.1) : 1.7

