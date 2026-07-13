import AppKit
import CoreGraphics
import Foundation
import Vision

struct Observation: Codable {
  let text: String
  let confidence: Float
  let x: CGFloat
  let y: CGFloat
  let width: CGFloat
  let height: CGFloat
}

struct ResultPayload: Codable {
  let status: String
  let message: String?
  let observations: [Observation]
}

enum CaptureError: LocalizedError {
  case permissionDenied
  case hearthstoneWindowNotFound
  case imageLoadFailed
  case captureFailed

  var errorDescription: String? {
    switch self {
    case .permissionDenied:
      return "需要允许炉石记牌器录制屏幕，才能自动识别当前模式和套牌。授权后请重新打开记牌器。"
    case .hearthstoneWindowNotFound:
      return "没有找到炉石传说窗口。"
    case .imageLoadFailed:
      return "无法读取竞技场画面。"
    case .captureFailed:
      return "无法截取炉石传说窗口。"
    }
  }

  var status: String {
    switch self {
    case .permissionDenied:
      return "permission-denied"
    case .hearthstoneWindowNotFound:
      return "window-not-found"
    case .imageLoadFailed:
      return "image-load-failed"
    case .captureFailed:
      return "capture-failed"
    }
  }
}

func output(_ payload: ResultPayload) {
  let encoder = JSONEncoder()
  encoder.outputFormatting = [.sortedKeys]
  guard let data = try? encoder.encode(payload), let text = String(data: data, encoding: .utf8) else {
    return
  }
  print(text)
}

func imageFromPath(_ path: String) throws -> CGImage {
  guard let image = NSImage(contentsOfFile: path),
        let tiff = image.tiffRepresentation,
        let bitmap = NSBitmapImageRep(data: tiff),
        let cgImage = bitmap.cgImage else {
    throw CaptureError.imageLoadFailed
  }
  return cgImage
}

func captureForegroundDisplayWithSystemTool() throws -> CGImage {
  let tempUrl = URL(fileURLWithPath: NSTemporaryDirectory())
    .appendingPathComponent("hearthstone-arena-ocr-\(UUID().uuidString).png")
  defer {
    try? FileManager.default.removeItem(at: tempUrl)
  }

  let process = Process()
  process.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
  process.arguments = ["-x", tempUrl.path]
  try process.run()
  process.waitUntilExit()
  guard process.terminationStatus == 0 else {
    throw CaptureError.captureFailed
  }
  return try imageFromPath(tempUrl.path)
}

func captureHearthstoneWindow() async throws -> CGImage {
  if !CGPreflightScreenCaptureAccess() {
    throw CaptureError.permissionDenied
  }

  // Hearthstone's full-screen renderer can be absent from the macOS window list
  // or crash ScreenCaptureKit while it owns the foreground space. The system
  // screenshot tool uses the same permission boundary but is stable there.
  return try captureForegroundDisplayWithSystemTool()
}

func recognize(_ image: CGImage, profile: String?) throws -> [Observation] {
  var observations: [Observation] = []
  let isConstructed = profile == "constructed"
  let regions = isConstructed
    ? [
        CGRect(x: 0.25, y: 0.86, width: 0.35, height: 0.11),
        CGRect(x: 0.65, y: 0.25, width: 0.25, height: 0.20)
      ]
    : [CGRect(x: 0, y: 0, width: 1, height: 1)]
  let requests = regions.map { region in
    let request = VNRecognizeTextRequest { request, _ in
      for observation in request.results as? [VNRecognizedTextObservation] ?? [] {
        guard let candidate = observation.topCandidates(1).first else {
          continue
        }
        let box = observation.boundingBox
        observations.append(Observation(
          text: candidate.string,
          confidence: candidate.confidence,
          x: region.origin.x + box.origin.x * region.width,
          y: region.origin.y + box.origin.y * region.height,
          width: box.width * region.width,
          height: box.height * region.height
        ))
      }
    }
    request.regionOfInterest = region
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["zh-Hans", "en-US"]
    request.usesLanguageCorrection = true
    request.minimumTextHeight = isConstructed ? 0.08 : 0.012
    return request
  }
  try VNImageRequestHandler(cgImage: image, options: [:]).perform(requests)
  return observations.sorted { left, right in
    left.x == right.x ? left.y > right.y : left.x < right.x
  }
}

do {
  let args = CommandLine.arguments.dropFirst()
  if args.contains("--request-screen-permission") {
    guard CGPreflightScreenCaptureAccess() || CGRequestScreenCaptureAccess() else {
      throw CaptureError.permissionDenied
    }
    output(ResultPayload(status: "ok", message: nil, observations: []))
    exit(0)
  }
  let image: CGImage
  let profile = args.firstIndex(of: "--profile").flatMap { profileFlag in
    args.indices.contains(args.index(after: profileFlag)) ? String(args[args.index(after: profileFlag)]) : nil
  }
  if let imageFlag = args.firstIndex(of: "--image"), args.indices.contains(args.index(after: imageFlag)) {
    image = try imageFromPath(String(args[args.index(after: imageFlag)]))
  } else {
    let semaphore = DispatchSemaphore(value: 0)
    var captured: Result<CGImage, Error>?
    Task {
      do {
        captured = .success(try await captureHearthstoneWindow())
      } catch {
        captured = .failure(error)
      }
      semaphore.signal()
    }
    semaphore.wait()
    guard let captured else {
      throw CaptureError.captureFailed
    }
    image = try captured.get()
  }
  output(ResultPayload(status: "ok", message: nil, observations: try recognize(image, profile: profile)))
} catch let error as CaptureError {
  output(ResultPayload(status: error.status, message: error.localizedDescription, observations: []))
} catch {
  output(ResultPayload(status: "failed", message: error.localizedDescription, observations: []))
}
