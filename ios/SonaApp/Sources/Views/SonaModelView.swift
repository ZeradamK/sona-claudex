import SwiftUI
import SceneKit
import GLTFKit2
import simd

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
                addLighting(to: modelScene)
                frameCamera(on: modelScene, view: view)
                applyIdleAnimation(to: modelScene)
            }
        }
    }

    // MARK: Lighting

    private func addLighting(to scene: SCNScene) {
        // Softer, less luminous: lower IBL + key so the face isn't blown out.
        scene.lightingEnvironment.contents = UIColor(white: 0.78, alpha: 1)
        scene.lightingEnvironment.intensity = 0.85

        let key = SCNNode()
        key.light = SCNLight()
        key.light?.type = .directional
        key.light?.intensity = 420
        key.eulerAngles = SCNVector3(-0.5, 0.5, 0)
        scene.rootNode.addChildNode(key)

        let ambient = SCNNode()
        ambient.light = SCNLight()
        ambient.light?.type = .ambient
        ambient.light?.intensity = 150
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
        // HDR auto-exposure was progressively blowing out the face (starts normal,
        // then glares up). Disable HDR + exposure adaptation → constant exposure.
        camera.wantsHDR = false
        camera.wantsExposureAdaptation = false

        let camNode = SCNNode()
        camNode.camera = camera
        let fovRad = Float(camera.fieldOfView) * .pi / 180
        let distance = (height * 0.72) / tan(fovRad / 2) // headroom for idle motion
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

    // MARK: Mocap idle — a real Mixamo "Idle" clip retargeted onto the RPM skeleton

    private func applyIdleAnimation(to scene: SCNScene) {
        guard let url = Bundle.main.url(forResource: "animations", withExtension: "glb") else {
            poseAndAnimate(scene); return
        }
        NSLog("SONA anim: loading %@", url.lastPathComponent)
        GLTFAsset.load(with: url, options: [:]) { _, status, maybeAsset, error, _ in
            NSLog("SONA anim: status=%ld err=%@", status.rawValue,
                  error == nil ? "nil" : String(describing: error!))
            guard status == .complete, let asset = maybeAsset else {
                DispatchQueue.main.async { self.poseAndAnimate(scene) }
                return
            }
            let source = GLTFSCNSceneSource(asset: asset)
            let anims = source.animations
            DispatchQueue.main.async {
                NSLog("SONA anim: %d clips [%@]", anims.count, anims.map { $0.name }.joined(separator: ","))
                let idle = anims.first(where: { $0.name.lowercased().contains("idle") }) ?? anims.first
                guard let idle = idle else { self.poseAndAnimate(scene); return }
                let player = idle.animationPlayer
                player.animation.repeatCount = .greatestFiniteMagnitude
                player.animation.isRemovedOnCompletion = false
                let target = scene.rootNode.childNode(withName: "Armature", recursively: true) ?? scene.rootNode
                target.addAnimationPlayer(player, forKey: "idle")
                player.play()
                NSLog("SONA idle '%@' → %@", idle.name, target.name ?? "root")
            }
        }
    }

    // MARK: Procedural fallback (used only if the clip fails to load)

    private func poseAndAnimate(_ scene: SCNScene) {
        let root = scene.rootNode
        func bone(_ name: String) -> SCNNode? { root.childNode(withName: name, recursively: true) }

        // Bring the arms down out of the T-pose (rotate upper arms in parent space).
        if let la = bone("LeftArm") { rotateParent(la, axis: [0, 0, 1], angle: -1.2) }
        if let ra = bone("RightArm") { rotateParent(ra, axis: [0, 0, 1], angle: 1.2) }
        // A touch of elbow bend so the arms read as relaxed, not stiff.
        if let lf = bone("LeftForeArm") { rotateParent(lf, axis: [0, 1, 0], angle: 0.35) }
        if let rf = bone("RightForeArm") { rotateParent(rf, axis: [0, 1, 0], angle: -0.35) }

        // Breathing.
        bone("Spine1")?.runAction(loopRotate(x: 0.022, dur: 2.2))
        // Gentle head/neck life.
        bone("Neck")?.runAction(loopRotate(y: 0.05, dur: 3.4))
        bone("Head")?.runAction(loopRotate(x: 0.03, y: 0.04, dur: 4.1))
        // Subtle arm settle.
        bone("LeftArm")?.runAction(loopRotate(x: 0.03, dur: 2.8))
        bone("RightArm")?.runAction(loopRotate(x: 0.03, dur: 3.1))
    }

    /// Rotate a node about an axis expressed in its PARENT's space (pre-multiply).
    private func rotateParent(_ node: SCNNode, axis: simd_float3, angle: Float) {
        let q = simd_quatf(angle: angle, axis: simd_normalize(axis))
        node.simdOrientation = q * node.simdOrientation
    }

    /// A gentle, looping ease-in-out rotation that oscillates around the base pose.
    private func loopRotate(x: CGFloat = 0, y: CGFloat = 0, dur: TimeInterval) -> SCNAction {
        let fwd = SCNAction.rotateBy(x: x, y: y, z: 0, duration: dur)
        let back = SCNAction.rotateBy(x: -x, y: -y, z: 0, duration: dur)
        fwd.timingMode = .easeInEaseOut
        back.timingMode = .easeInEaseOut
        return .repeatForever(.sequence([fwd, back]))
    }
}
