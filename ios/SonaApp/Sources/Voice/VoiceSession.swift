import AVFoundation
import Foundation

/// Voice-to-voice with Sona, ported from the web pipeline:
///   1. POST /api/voice/token on the Sona backend → ephemeral Gemini Live token
///      (model + voice + persona + server-side VAD all baked into the token).
///   2. Open the Gemini Live WebSocket with that token.
///   3. Stream mic audio up as PCM16 @ 16 kHz; play model audio down (PCM16 @ 24 kHz).
///
/// There is no Swift Gemini SDK, so this speaks the raw BidiGenerateContent
/// protocol over URLSessionWebSocketTask.
@MainActor
final class VoiceSession: ObservableObject {
    enum Mode: String { case idle, connecting, listening, speaking }

    @Published private(set) var mode: Mode = .idle
    @Published private(set) var error: String?

    /// Where the Sona backend lives. The iOS Simulator reaches the Mac via localhost.
    static let backendBaseURL =
        ProcessInfo.processInfo.environment["SONA_BACKEND"] ?? "http://localhost:3007"
    private let personalityId: String

    private var ws: URLSessionWebSocketTask?
    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private var converter: AVAudioConverter?
    private let captureFormat = AVAudioFormat(
        commonFormat: .pcmFormatInt16, sampleRate: 16000, channels: 1, interleaved: true)!
    private let playbackFormat = AVAudioFormat(
        commonFormat: .pcmFormatFloat32, sampleRate: 24000, channels: 1, interleaved: false)!
    private var started = false

    init(personalityId: String = "sona") {
        self.personalityId = personalityId
    }

    // MARK: Public control

    func toggle() {
        mode == .idle ? start() : stop()
    }

    func start() {
        guard mode == .idle else { return }
        error = nil
        mode = .connecting
        Task { await connect() }
    }

    func stop() {
        ws?.cancel(with: .goingAway, reason: nil)
        ws = nil
        teardownAudio()
        started = false
        mode = .idle
    }

    // MARK: Connect

    private func connect() async {
        do {
            let creds = try await mintToken()
            try await openSocket(token: creds.token, model: creds.model)
        } catch {
            self.error = (error as NSError).localizedDescription
            self.mode = .idle
        }
    }

    private struct Creds: Decodable { let token: String; let model: String }

    private func mintToken() async throws -> Creds {
        guard let url = URL(string: "\(Self.backendBaseURL)/api/voice/token") else {
            throw err("bad backend url")
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["personalityId": personalityId])
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse, http.statusCode == 200 else {
            throw err("token endpoint \( (resp as? HTTPURLResponse)?.statusCode ?? -1) — is the dev server running?")
        }
        return try JSONDecoder().decode(Creds.self, from: data)
    }

    private func openSocket(token: String, model: String) async throws {
        let host = "generativelanguage.googleapis.com"
        // Ephemeral auth_tokens use the *Constrained* method + ?access_token=
        // (verified against the genai SDK and a live handshake → setupComplete).
        let path = "/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained"
        guard let url = URL(string: "wss://\(host)\(path)?access_token=\(token)") else {
            throw err("bad ws url")
        }
        let task = URLSession.shared.webSocketTask(with: url)
        ws = task
        task.resume()

        // Setup frame — the rest of the config is locked into the token. The model
        // must be the full resource name (models/…).
        let modelName = model.hasPrefix("models/") ? model : "models/\(model)"
        let setup: [String: Any] = ["setup": ["model": modelName]]
        try await send(json: setup)
        receiveLoop()
    }

    // MARK: WebSocket I/O

    private func send(json: [String: Any]) async throws {
        let data = try JSONSerialization.data(withJSONObject: json)
        guard let text = String(data: data, encoding: .utf8) else { return }
        try await ws?.send(.string(text))
    }

    private func receiveLoop() {
        ws?.receive { [weak self] result in
            guard let self else { return }
            switch result {
            case .failure(let e):
                Task { @MainActor in
                    if self.mode != .idle { self.error = e.localizedDescription; self.stop() }
                }
            case .success(let message):
                let data: Data?
                switch message {
                case .string(let s): data = s.data(using: .utf8)
                case .data(let d): data = d
                @unknown default: data = nil
                }
                if let data { Task { @MainActor in self.handle(data) } }
                self.receiveLoop()
            }
        }
    }

    private func handle(_ data: Data) {
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }

        if root["setupComplete"] != nil {
            startAudio()
            return
        }
        guard let server = root["serverContent"] as? [String: Any] else { return }

        if let turn = server["modelTurn"] as? [String: Any],
           let parts = turn["parts"] as? [[String: Any]] {
            for part in parts {
                if let inline = part["inlineData"] as? [String: Any],
                   let b64 = inline["data"] as? String,
                   let pcm = Data(base64Encoded: b64) {
                    if mode != .speaking { mode = .speaking }
                    enqueue(pcm: pcm)
                }
            }
        }
        if server["turnComplete"] != nil || server["interrupted"] != nil {
            if mode == .speaking { mode = .listening }
            if server["interrupted"] != nil { player.stop(); player.play() }
        }
    }

    // MARK: Audio

    private func startAudio() {
        guard !started else { return }
        do {
            let s = AVAudioSession.sharedInstance()
            try s.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetooth])
            try s.setActive(true)

            engine.attach(player)
            engine.connect(player, to: engine.mainMixerNode, format: playbackFormat)

            let input = engine.inputNode
            let inFormat = input.outputFormat(forBus: 0)
            converter = AVAudioConverter(from: inFormat, to: captureFormat)
            input.installTap(onBus: 0, bufferSize: 1600, format: inFormat) { [weak self] buffer, _ in
                self?.captureAndSend(buffer)
            }
            engine.prepare()
            try engine.start()
            player.play()
            started = true
            mode = .listening
        } catch {
            self.error = "audio: \(error.localizedDescription)"
            stop()
        }
    }

    private func teardownAudio() {
        if started {
            engine.inputNode.removeTap(onBus: 0)
            player.stop()
            engine.stop()
            try? AVAudioSession.sharedInstance().setActive(false)
        }
    }

    /// Convert a hardware-format mic buffer to 16 kHz PCM16 and send it up.
    private func captureAndSend(_ buffer: AVAudioPCMBuffer) {
        guard let converter else { return }
        let ratio = captureFormat.sampleRate / buffer.format.sampleRate
        let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio + 64)
        guard let out = AVAudioPCMBuffer(pcmFormat: captureFormat, frameCapacity: capacity) else { return }
        var consumed = false
        var convError: NSError?
        converter.convert(to: out, error: &convError) { _, status in
            if consumed { status.pointee = .noDataNow; return nil }
            consumed = true
            status.pointee = .haveData
            return buffer
        }
        guard convError == nil, out.frameLength > 0,
              let ch = out.int16ChannelData else { return }
        let bytes = Data(bytes: ch[0], count: Int(out.frameLength) * 2)
        let payload: [String: Any] = [
            "realtimeInput": ["audio": ["data": bytes.base64EncodedString(),
                                        "mimeType": "audio/pcm;rate=16000"]]
        ]
        Task { try? await send(json: payload) }
    }

    /// Play one chunk of model audio (PCM16 @ 24 kHz).
    private func enqueue(pcm: Data) {
        let frames = AVAudioFrameCount(pcm.count / 2)
        guard frames > 0,
              let buffer = AVAudioPCMBuffer(pcmFormat: playbackFormat, frameCapacity: frames),
              let out = buffer.floatChannelData else { return }
        buffer.frameLength = frames
        pcm.withUnsafeBytes { raw in
            let samples = raw.bindMemory(to: Int16.self)
            for i in 0..<Int(frames) {
                out[0][i] = Float(samples[i]) / 32768.0
            }
        }
        player.scheduleBuffer(buffer, completionHandler: nil)
    }

    private func err(_ message: String) -> NSError {
        NSError(domain: "VoiceSession", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
}
