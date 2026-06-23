# Sona iOS

Native SwiftUI companion app for Sona — a full-screen 3D avatar you talk to,
with the conversation stored on-device.

## Stack
- **SwiftUI** UI, **SceneKit** + **GLTFKit2** to render the GLB avatar (`sona.glb`)
- **XcodeGen** generates the Xcode project from `project.yml`
- Conversation persisted to a JSON file in the app's Documents directory

## Build & run (CLI, no Xcode GUI)
```bash
cd ios/SonaApp
xcodegen generate
xcodebuild -project SonaApp.xcodeproj -scheme SonaApp -sdk iphonesimulator \
  -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath build build
