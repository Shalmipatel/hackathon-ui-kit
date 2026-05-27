#!/usr/bin/env bash
# Archive + export + upload Wanderbot to TestFlight.
#
# Required env vars:
#   ASC_API_KEY_ID       — 10-char Key ID from App Store Connect.
#   ASC_API_ISSUER_ID    — UUID issuer ID from App Store Connect.
#   ASC_API_KEY_PATH     — Path to AuthKey_<KeyID>.p8 file.
#
# Optional:
#   BUILD_NUMBER         — defaults to the current epoch seconds.
#                          Must be monotonically increasing per
#                          MARKETING_VERSION (App Store rejects
#                          re-used numbers).
#
# Run from the repo root:
#   ASC_API_KEY_ID=...   \
#   ASC_API_ISSUER_ID=... \
#   ASC_API_KEY_PATH=~/Downloads/AuthKey_XXXX.p8 \
#   bash ios/Scripts/deploy-testflight.sh

set -euo pipefail

cd "$(dirname "$0")/../.."   # → repo root

: "${ASC_API_KEY_ID:?Missing ASC_API_KEY_ID}"
: "${ASC_API_ISSUER_ID:?Missing ASC_API_ISSUER_ID}"
: "${ASC_API_KEY_PATH:?Missing ASC_API_KEY_PATH}"

if [[ ! -f "$ASC_API_KEY_PATH" ]]; then
  echo "❌ ASC_API_KEY_PATH does not exist: $ASC_API_KEY_PATH" >&2
  exit 1
fi

BUILD_NUMBER="${BUILD_NUMBER:-$(date +%s)}"
ARCHIVE_PATH="/tmp/Wanderbot.xcarchive"
EXPORT_PATH="/tmp/Wanderbot-export"
PROJECT="ios/Wanderbot/Wanderbot.xcodeproj"
SCHEME="Wanderbot"
EXPORT_OPTIONS="ios/ExportOptions.plist"
DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
export DEVELOPER_DIR

echo "▶︎ Cleaning previous archive / export"
rm -rf "$ARCHIVE_PATH" "$EXPORT_PATH"

echo "▶︎ Archiving (build $BUILD_NUMBER)"
xcodebuild archive \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$ARCHIVE_PATH" \
  -allowProvisioningUpdates \
  -authenticationKeyID "$ASC_API_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_API_ISSUER_ID" \
  -authenticationKeyPath "$ASC_API_KEY_PATH" \
  CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
  2>&1 | tail -60

echo "▶︎ Exporting signed IPA"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_PATH" \
  -exportOptionsPlist "$EXPORT_OPTIONS" \
  -allowProvisioningUpdates \
  -authenticationKeyID "$ASC_API_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_API_ISSUER_ID" \
  -authenticationKeyPath "$ASC_API_KEY_PATH" \
  2>&1 | tail -60

IPA="$EXPORT_PATH/Wanderbot.ipa"
if [[ ! -f "$IPA" ]]; then
  echo "❌ Expected IPA at $IPA but it's missing." >&2
  exit 1
fi
echo "✓ Built IPA: $IPA"

echo "▶︎ Uploading to App Store Connect"
xcrun altool --upload-app \
  --type ios \
  --file "$IPA" \
  --apiKey "$ASC_API_KEY_ID" \
  --apiIssuer "$ASC_API_ISSUER_ID"

echo "✓ Uploaded. TestFlight will process the build in a few minutes."
echo "  Watch at https://appstoreconnect.apple.com/apps → Wanderbot → TestFlight."
