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
DEV=$(xcrun simctl list devices available | grep 'iPhone 17 Pro' | head -1 | grep -oE '[0-9A-F-]{36}')
xcrun simctl install "$DEV" build/Build/Products/Debug-iphonesimulator/SonaApp.app
xcrun simctl launch "$DEV" ai.sona.app
```

## Layout
- `Sources/ContentView.swift` — composes the screen
- `Sources/Views/SonaModelView.swift` — the 3D avatar (GLTFKit2 → SceneKit)
- `Sources/Views/BackgroundScene.swift` — broken-white background
- `Sources/Views/{TopControls,TalkButton,BottomBar,ChatSheet}.swift` — UI
- `Sources/Models/{Message,ConversationStore}.swift` — on-device conversation

## Roadmap
- Relaxed idle pose/animation (avatar ships in T-pose)
- Live voice via Gemini (the web app's `/api/voice/token` flow)
- Camera, wake word
