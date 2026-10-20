// swift-tools-version: 6.0
import PackageDescription

// The GeneSense iPhone app: a native shell around the live web app, built with xtool (see README.md).
let package = Package(
    name: "GeneSense",
    platforms: [.iOS(.v17)],
    products: [.library(name: "GeneSense", targets: ["GeneSense"])],
    targets: [.target(name: "GeneSense")],
    swiftLanguageModes: [.v5]
)
