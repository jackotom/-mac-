import AppKit
import Foundation

let workspace = NSWorkspace.shared

if let name = workspace.frontmostApplication?.localizedName?.trimmingCharacters(in: .whitespacesAndNewlines),
   !name.isEmpty {
  print(name)
  exit(0)
}

if let bundleIdentifier = workspace.frontmostApplication?.bundleIdentifier?.trimmingCharacters(in: .whitespacesAndNewlines),
   !bundleIdentifier.isEmpty {
  print(bundleIdentifier)
  exit(0)
}

exit(1)
