import AppKit
import Foundation

// Deterministic macOS icon packaging: preserve source pixels, add a native alpha mask.
let input = CommandLine.arguments[1]
let output = CommandLine.arguments[2]
guard let source = NSImage(contentsOfFile: input),
      let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 1024, pixelsHigh: 1024,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0),
      let context = NSGraphicsContext(bitmapImageRep: bitmap) else { fatalError("Image unavailable") }
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = context
NSColor.clear.setFill()
NSRect(x: 0, y: 0, width: 1024, height: 1024).fill(using: .copy)
let frame = NSRect(x: 96, y: 96, width: 832, height: 832)
NSBezierPath(roundedRect: frame, xRadius: 184, yRadius: 184).addClip()
context.imageInterpolation = .high
source.draw(in: frame, from: .zero, operation: .copy, fraction: 1)
NSGraphicsContext.restoreGraphicsState()
guard let data = bitmap.representation(using: .png, properties: [:]) else { fatalError("PNG unavailable") }
try data.write(to: URL(fileURLWithPath: output))
for (x,y) in [(0,0),(100,100),(1023,0),(0,1023),(1023,1023)] {
  guard let color = bitmap.colorAt(x:x,y:y), color.alphaComponent == 0 else { fatalError("Corner must be transparent") }
}
guard bitmap.colorAt(x:512,y:512)!.alphaComponent == 1 else { fatalError("Center must be opaque") }
print("Verified: transparent padding and corners, opaque center, 1024px RGBA.")
