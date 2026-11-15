#!/bin/sh
# Re-encodes the README demo (.github/assets/demo.webp) as the site's video. Needs ffmpeg.
# H.264 needs even dimensions, so the crop drops an odd last row or column.
set -e
cd "$(dirname "$0")/.."
ffmpeg -v error -y -i .github/assets/demo.webp -vf "crop=trunc(iw/2)*2:trunc(ih/2)*2:0:0" \
  -c:v libx264 -pix_fmt yuv420p -crf 26 -preset slow -tune animation -movflags +faststart -an \
  site/assets/demo.mp4
