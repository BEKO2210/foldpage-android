#!/usr/bin/env bash
# The speech engine FoldPage carries itself.
#
# 47 MB of native libraries have no business in a git history, so the AAR is
# fetched instead of committed. Pinned to a version rather than "latest": an
# engine that changes under a build nobody asked to change is how a phone
# starts sounding different for no reason anybody can trace.
set -euo pipefail
VERSION="1.13.5"
TARGET="$(dirname "$0")/../android/app/libs/sherpa-onnx-${VERSION}.aar"
URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/v${VERSION}/sherpa-onnx-${VERSION}.aar"

if [ -f "$TARGET" ]; then
  echo "sherpa-onnx ${VERSION} is already here: $TARGET"
  exit 0
fi
mkdir -p "$(dirname "$TARGET")"
echo "fetching sherpa-onnx ${VERSION} (about 47 MB) …"
curl -fL --progress-bar -o "$TARGET" "$URL"
ls -lh "$TARGET"
