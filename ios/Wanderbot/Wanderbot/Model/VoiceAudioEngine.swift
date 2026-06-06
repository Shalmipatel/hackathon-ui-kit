import AVFoundation
import os

/// Thread-safe rolling RMS buffer shared between the audio render thread
/// and the MainActor. The mic tap calls `push(_:)` at render rate; the UI
/// polls `samples` for the waveform.
final class AudioLevelMeter: @unchecked Sendable {
    private let barCount: Int
    private var _samples: [Float]
    private var _writeIndex = 0
    private let lock = os_unfair_lock_t.allocate(capacity: 1)

    init(barCount: Int = 40) {
        self.barCount = barCount
        self._samples = Array(repeating: 0, count: barCount)
        lock.initialize(to: os_unfair_lock())
    }

    deinit { lock.deallocate() }

    func push(_ rms: Float) {
        os_unfair_lock_lock(lock)
        _samples[_writeIndex % barCount] = rms
        _writeIndex += 1
        os_unfair_lock_unlock(lock)
    }

    var samples: [Float] {
        os_unfair_lock_lock(lock)
        let start = _writeIndex % barCount
        let result = Array(_samples[start...]) + Array(_samples[..<start])
        os_unfair_lock_unlock(lock)
        return result
    }
}

/// Callback delivering base64-encoded 24 kHz Int16 PCM audio from the mic.
typealias MicAudioHandler = (String) -> Void

/// AVAudioEngine wrapper for simultaneous mic capture + playback.
/// Mic audio is resampled to 24 kHz Int16 PCM (base64). Incoming audio
/// deltas (base64 Int16 @ 24 kHz) are decoded and played.
///
/// Ported from the xAI cookbook reference (iOS VoiceTesterApp).
@MainActor
final class VoiceAudioEngine {

    static let sampleRate: Double = 24_000
    static let outputFormat = AVAudioFormat(
        commonFormat: .pcmFormatFloat32,
        sampleRate: sampleRate,
        channels: 1,
        interleaved: false
    )!

    let levelMeter = AudioLevelMeter()
    var isRunning: Bool { engine?.isRunning ?? false }

    private var engine: AVAudioEngine?
    private var playerNode: AVAudioPlayerNode?

    /// Configure the session, install the mic tap, and start. `onMicAudio`
    /// fires on the render thread with base64 24 kHz Int16 PCM chunks.
    @discardableResult
    func start(echoCancellation: Bool, onMicAudio: @escaping MicAudioHandler) -> Bool {
        do {
            let session = AVAudioSession.sharedInstance()
            let mode: AVAudioSession.Mode = echoCancellation ? .voiceChat : .default
            try session.setCategory(.playAndRecord, mode: mode, options: [.defaultToSpeaker, .allowBluetoothA2DP])
            try session.setActive(true)
        } catch {
            NSLog("[voice-audio] session error: %@", String(describing: error))
            return false
        }

        let engine = AVAudioEngine()

        // Attach output nodes BEFORE enabling voice processing.
        let player = AVAudioPlayerNode()
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: Self.outputFormat)

        if echoCancellation {
            do {
                try engine.inputNode.setVoiceProcessingEnabled(true)
                engine.inputNode.isVoiceProcessingAGCEnabled = true
                engine.inputNode.isVoiceProcessingBypassed = false
            } catch {
                NSLog("[voice-audio] voice processing failed: %@ — continuing without AEC", String(describing: error))
            }
        }

        let inputNode = engine.inputNode
        let inputFormat = inputNode.outputFormat(forBus: 0)
        guard inputFormat.sampleRate > 0 else {
            NSLog("[voice-audio] mic input has zero sample rate")
            return false
        }

        let meter = self.levelMeter
        inputNode.installTap(onBus: 0, bufferSize: 4096, format: inputFormat) { buffer, _ in
            meter.push(Self.computeRMS(buffer))
            guard let data = Self.resampleToInt16(buffer: buffer, inputFormat: inputFormat) else { return }
            onMicAudio(data.base64EncodedString())
        }

        do {
            engine.prepare()
            try engine.start()
            player.play()
        } catch {
            NSLog("[voice-audio] engine start error: %@", String(describing: error))
            return false
        }

        self.engine = engine
        self.playerNode = player
        return true
    }

    func stop() {
        guard let engine else { return }
        engine.inputNode.removeTap(onBus: 0)
        playerNode?.stop()
        if engine.isRunning { engine.stop() }
        self.engine = nil
        self.playerNode = nil

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
    }

    /// Decode a base64 Int16 audio delta and schedule it for playback.
    func playAudioDelta(base64: String) {
        guard let audioData = Data(base64Encoded: base64),
              let playerNode,
              let engine, engine.isRunning else { return }

        let frameCount = audioData.count / MemoryLayout<Int16>.size
        guard frameCount > 0,
              let buffer = AVAudioPCMBuffer(pcmFormat: Self.outputFormat, frameCapacity: UInt32(frameCount)),
              let floats = buffer.floatChannelData?[0] else { return }

        buffer.frameLength = UInt32(frameCount)
        audioData.withUnsafeBytes { raw in
            guard let src = raw.baseAddress?.assumingMemoryBound(to: Int16.self) else { return }
            for i in 0..<frameCount {
                floats[i] = Float(src[i]) / Float(Int16.max)
            }
        }

        playerNode.scheduleBuffer(buffer)
        if !playerNode.isPlaying { playerNode.play() }
    }

    /// Stop current playback and re-prime the player (used on barge-in).
    func interruptPlayback() {
        playerNode?.stop()
        playerNode?.play()
    }

    // MARK: - Render-thread-safe processing

    nonisolated static func computeRMS(_ buffer: AVAudioPCMBuffer) -> Float {
        guard let data = buffer.floatChannelData?[0] else { return 0 }
        let count = Int(buffer.frameLength)
        guard count > 0 else { return 0 }
        var sum: Float = 0
        for i in 0..<count { sum += data[i] * data[i] }
        return sqrt(sum / Float(count))
    }

    nonisolated static func resampleToInt16(buffer: AVAudioPCMBuffer, inputFormat: AVAudioFormat) -> Data? {
        let targetRate = sampleRate

        let sourceBuffer: AVAudioPCMBuffer
        if inputFormat.sampleRate != targetRate {
            guard let fmt = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: targetRate, channels: 1, interleaved: true),
                  let converter = AVAudioConverter(from: inputFormat, to: fmt) else { return nil }
            let newCount = AVAudioFrameCount(Double(buffer.frameLength) * targetRate / inputFormat.sampleRate)
            guard let converted = AVAudioPCMBuffer(pcmFormat: fmt, frameCapacity: newCount) else { return nil }
            var error: NSError?
            converter.convert(to: converted, error: &error) { _, outStatus in
                outStatus.pointee = .haveData
                return buffer
            }
            if error != nil { return nil }
            sourceBuffer = converted
        } else {
            sourceBuffer = buffer
        }

        guard let floats = sourceBuffer.floatChannelData?[0] else { return nil }
        let count = Int(sourceBuffer.frameLength)
        var int16s = [Int16](repeating: 0, count: count)
        for i in 0..<count {
            int16s[i] = Int16(max(-1, min(1, floats[i])) * Float(Int16.max - 1))
        }
        return Data(bytes: &int16s, count: count * MemoryLayout<Int16>.size)
    }
}
