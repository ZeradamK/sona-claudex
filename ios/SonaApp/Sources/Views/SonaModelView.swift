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

        let camera = SCNCamera()
        camera.fieldOfView = 32
        camera.zNear = 0.01
        camera.zFar = 1000
        camera.wantsHDR = true

        let camNode = SCNNode()
        camNode.camera = camera
        let fovRad = Float(camera.fieldOfView) * .pi / 180
        let distance = (height * 0.62) / tan(fovRad / 2)
        camNode.position = SCNVector3(center.x, center.y, center.z + distance)
        camNode.look(at: center)
        scene.rootNode.addChildNode(camNode)
        view.pointOfView = camNode
        NSLog("SONA framed h=%.2f cam=(%.2f,%.2f,%.2f)", height, camNode.position.x, camNode.position.y, camNode.position.z)
    }

    private func combinedBounds(_ root: SCNNode) -> (SCNVector3, SCNVector3) {
        var minV = SCNVector3(Float.greatestFiniteMagnitude, Float.greatestFiniteMagnitude, Float.greatestFiniteMagnitude)
        var maxV = SCNVector3(-Float.greatestFiniteMagnitude, -Float.greatestFiniteMagnitude, -Float.greatestFiniteMagnitude)
        root.enumerateHierarchy { node, _ in
            guard node.geometry != nil else { return }
            let (lo, hi) = node.boundingBox
            let corners = [
                SCNVector3(lo.x, lo.y, lo.z), SCNVector3(hi.x, lo.y, lo.z),
                SCNVector3(lo.x, hi.y, lo.z), SCNVector3(hi.x, hi.y, lo.z),
                SCNVector3(lo.x, lo.y, hi.z), SCNVector3(hi.x, lo.y, hi.z),
                SCNVector3(lo.x, hi.y, hi.z), SCNVector3(hi.x, hi.y, hi.z)
            ]
            for corner in corners {
                let w = root.convertPosition(corner, from: node)
                minV.x = min(minV.x, w.x); maxV.x = max(maxV.x, w.x)
                minV.y = min(minV.y, w.y); maxV.y = max(maxV.y, w.y)
                minV.z = min(minV.z, w.z); maxV.z = max(maxV.z, w.z)
            }
        }
        return (minV, maxV)
    }

    private func idleSway(_ node: SCNNode) {
        let sway = SCNAction.sequence([
            SCNAction.rotateBy(x: 0, y: 0.05, z: 0, duration: 2.4),
            SCNAction.rotateBy(x: 0, y: -0.05, z: 0, duration: 2.4)
        ])
        sway.timingMode = .easeInEaseOut
        node.runAction(.repeatForever(sway))
    }
}
