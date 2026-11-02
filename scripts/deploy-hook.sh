#!/usr/bin/env bash

# Copyright Alejandro Martínez Corriá and the Thinkube contributors
# SPDX-License-Identifier: Apache-2.0

#
# Steps only this repository needs, called by scripts/deploy.sh with
# dependencies, pre-package and post-install.
set -euo pipefail
cd "$(dirname "$0")/.."

case "${1:?hook step}" in
  dependencies)
    # The Word view lays a document out with HarfBuzz, which measures text with
    # the face's own OpenType or TrueType file (woff2 is not read). These are the
    # serif faces of Thinkube's book typesetting, from the commits and release
    # tkt-typesetting's image uses, each checked against its digest.
    FONTS=media/fonts
    rm -rf "$FONTS" && mkdir -p "$FONTS"
    EB=https://raw.githubusercontent.com/octaviopardo/EBGaramond12/106a4a6d377987459ae5e68673a4570f13b957fb/fonts/otf
    CP=https://raw.githubusercontent.com/Fonthausen/CrimsonPro/475ca6a0469ba2bd9c2a3bbf038957099392c04d/fonts/ttf
    while read -r sum url; do
      file="$FONTS/$(basename "$url")"
      curl --retry 5 --retry-delay 5 --retry-all-errors -fsSL "$url" -o "$file"
      echo "$sum  $file" | sha256sum -c --quiet -
    done <<EOF
8d618a6bc6e1f4444e1990c39770a62ccbc29394e57afcc58acd530c16489275 $EB/EBGaramond-Regular.otf
296feee09f6fa157f913cf3d75460b5e282b3c43dff4ddffbcc5c1a924f4fd14 $EB/EBGaramond-Italic.otf
2832055876314e4932c46809e919a45fd726a53faa6bfae53be9628723bde90f $EB/EBGaramond-Bold.otf
c010c63d6924e0dec2fedc1b0cb57e86ae9047bb0e9651ea603b0967d6e3072e $EB/EBGaramond-BoldItalic.otf
c328c0eff9c9a0947d8e61efa9432ca17843863366580d4a0a16208fa0be5273 $CP/CrimsonPro-Regular.ttf
d4ff0049165cb0e7e6eef1a6425f64f0ef6e82dde12408ba425dbc3cf1aa3257 $CP/CrimsonPro-Italic.ttf
d8fc7d47b2b8681e7513e365764808b986999e1a78928cc58d04f237d8b8f798 $CP/CrimsonPro-Bold.ttf
f413c429c60351e09296b6bc449419c53b6810030830fd04eb3f14655412b22a $CP/CrimsonPro-BoldItalic.ttf
EOF
    curl --retry 5 --retry-delay 5 --retry-all-errors -fsSL \
      https://github.com/alerque/libertinus/releases/download/v7.051/Libertinus-7.051.zip -o /tmp/libertinus.zip
    echo "4d9be29b5cb380c35af8ba967abcc752ad1e07be1f738a9789c33e0dd7478c92  /tmp/libertinus.zip" | sha256sum -c --quiet -
    for style in Regular Italic Bold BoldItalic; do
      unzip -q -j -o /tmp/libertinus.zip "Libertinus-7.051/static/OTF/LibertinusSerif-${style}.otf" -d "$FONTS"
    done
    rm /tmp/libertinus.zip
    ;;

  pre-package|post-install)
    ;;
esac
