#!/usr/bin/env bash
# Verify a macOS release artifact before it is uploaded or published.
set -euo pipefail

arch="${1:?usage: verify-macos-installer.sh <arm64|x64> <version>}"
version="${2:?usage: verify-macos-installer.sh <arm64|x64> <version>}"
case "$arch" in
  arm64) expected_machine_arch="arm64" ;;
  x64) expected_machine_arch="x86_64" ;;
  *) echo "Unsupported macOS architecture: $arch" >&2; exit 1 ;;
esac

release_dir="$(cd "$(dirname "$0")/../release" && pwd)"
stem="RemiAI-${version}-mac-${arch}"
dmg="$release_dir/$stem.dmg"
zip="$release_dir/$stem.zip"

for artifact in "$dmg" "$zip"; do
  if [[ ! -s "$artifact" ]]; then
    echo "Missing or empty macOS artifact: $artifact" >&2
    exit 1
  fi
done

hdiutil verify "$dmg"
unzip -tq "$zip" >/dev/null

mount_dir="$(mktemp -d "${TMPDIR:-/tmp}/remiai-verify.XXXXXX")"
mounted=false
cleanup() {
  if [[ "$mounted" == true ]]; then
    hdiutil detach "$mount_dir" -quiet
  fi
  rmdir "$mount_dir"
}
trap cleanup EXIT

hdiutil attach -readonly -nobrowse -mountpoint "$mount_dir" -quiet "$dmg"
mounted=true
app="$mount_dir/RemiAI.app"
if [[ ! -d "$app" ]]; then
  echo "RemiAI.app is missing from $dmg" >&2
  exit 1
fi

codesign --verify --deep --strict --verbose=2 "$app"
signature="$(codesign -dv --verbose=2 "$app" 2>&1)"
if ! grep -q '^Signature=adhoc$' <<<"$signature"; then
  echo "Expected an ad-hoc signed macOS app bundle" >&2
  echo "$signature" >&2
  exit 1
fi

actual_machine_arch="$(lipo -archs "$app/Contents/MacOS/RemiAI")"
if [[ "$actual_machine_arch" != "$expected_machine_arch" ]]; then
  echo "Wrong executable architecture: expected $expected_machine_arch, got $actual_machine_arch" >&2
  exit 1
fi

(cd "$release_dir" && shasum -a 256 "$stem.dmg" > "$stem.dmg.sha256" && shasum -a 256 "$stem.zip" > "$stem.zip.sha256")
echo "Verified $stem and wrote per-artifact SHA-256 files"
