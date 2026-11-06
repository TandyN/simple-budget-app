#!/usr/bin/env bash
# build-ios.sh — Prepares the embedded web bundle (`ios/SimpleBudget/www/`) on any OS,
# and on macOS (such as GitHub Actions `macos-latest` runners) generates the Xcode project,
# compiles the native iOS app, and optionally signs + uploads the `.ipa` to TestFlight.

set -euo pipefail

export PATH="$HOME/.local/share/mise/shims:$HOME/.local/bin:/tmp/mise/bin:$PATH"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

mode="${1:---simulator}"
version="$(jq -r '.version' package.json)"
commit_count="$(git rev-list --count HEAD)"

echo "▶ Building production web bundle for iOS v${version} (build ${commit_count})..."
pnpm run build

echo "▶ Copying dist/ into ios/SimpleBudget/www/..."
rm -rf ios/SimpleBudget/www
mkdir -p ios/SimpleBudget/www
cp -r dist/. ios/SimpleBudget/www/

if [[ "$mode" == "--prepare-only" ]]; then
  echo "✓ Prepared ios/SimpleBudget/www/ for Xcode."
  exit 0
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "ℹ Native Xcode compilation requires macOS (runs automatically on GitHub Actions macos-latest)."
  exit 0
fi

cd "$repo_root/ios"
if ! command -v xcodegen >/dev/null 2>&1; then
  echo "▶ Installing xcodegen via Homebrew..."
  brew install xcodegen
fi

echo "▶ Generating SimpleBudget.xcodeproj via xcodegen..."
xcodegen generate

if [[ "$mode" == "--simulator" ]]; then
  echo "▶ Compiling native iOS app for iOS Simulator..."
  xcodebuild \
    -project SimpleBudget.xcodeproj \
    -scheme SimpleBudget \
    -sdk iphonesimulator \
    -configuration Release \
    MARKETING_VERSION="$version" \
    CURRENT_PROJECT_VERSION="$commit_count" \
    CODE_SIGNING_ALLOWED=NO \
    build
  echo "✓ Native iOS Simulator build succeeded."
  exit 0
fi

if [[ "$mode" == "--testflight" ]]; then
  : "${APPLE_TEAM_ID:?Missing APPLE_TEAM_ID secret}"
  : "${APP_STORE_CONNECT_API_KEY_ID:?Missing APP_STORE_CONNECT_API_KEY_ID secret}"
  : "${APP_STORE_CONNECT_ISSUER_ID:?Missing APP_STORE_CONNECT_ISSUER_ID secret}"
  : "${APP_STORE_CONNECT_API_KEY_P8:?Missing APP_STORE_CONNECT_API_KEY_P8 secret}"

  echo "▶ Archiving signed native iOS .ipa for TestFlight..."
  archive_path="$repo_root/ios/build/SimpleBudget.xcarchive"
  export_dir="$repo_root/ios/build/export"

  xcodebuild \
    -project SimpleBudget.xcodeproj \
    -scheme SimpleBudget \
    -sdk iphoneos \
    -configuration Release \
    -archivePath "$archive_path" \
    DEVELOPMENT_TEAM="$APPLE_TEAM_ID" \
    MARKETING_VERSION="$version" \
    CURRENT_PROJECT_VERSION="$commit_count" \
    archive

  xcodebuild \
    -exportArchive \
    -archivePath "$archive_path" \
    -exportOptionsPlist ExportOptions.plist \
    -exportPath "$export_dir" \
    -allowProvisioningUpdates

  mkdir -p "$HOME/.appstoreconnect/private_keys"
  key_file="$HOME/.appstoreconnect/private_keys/AuthKey_${APP_STORE_CONNECT_API_KEY_ID}.p8"
  printf '%s\n' "$APP_STORE_CONNECT_API_KEY_P8" > "$key_file"

  echo "▶ Uploading SimpleBudget.ipa to TestFlight / App Store Connect..."
  xcrun altool --upload-app \
    --type ios \
    --file "$export_dir/SimpleBudget.ipa" \
    --apiKey "$APP_STORE_CONNECT_API_KEY_ID" \
    --apiIssuer "$APP_STORE_CONNECT_ISSUER_ID"

  echo "✓ Uploaded SimpleBudget v${version} (${commit_count}) to TestFlight!"
fi
