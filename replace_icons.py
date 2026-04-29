#!/usr/bin/env python3
"""
Replace VaultChat iOS + Android app icons from a single source image.

Usage:
  python3 replace_icons.py ~/Desktop/VaultChat.png

Source should be a square PNG (ideally 1024x1024 or larger). The image
itself is used as-is — including whatever background it has. For the
new shield+lock design with the white background, every platform will
show the white-card look.

Notes:
  - iOS App Icon must be opaque (no alpha). We composite onto white
    before saving.
  - Android adaptive icon foreground is rendered inside a 108dp circle
    with a "safe zone" of 66dp in the middle. The OS layers it on top
    of a solid background. We use white as the background and pad the
    image down to fit the safe zone.
"""

import os
import sys
from pathlib import Path
from PIL import Image

if len(sys.argv) != 2:
    print('usage: python3 replace_icons.py <source-image>', file=sys.stderr)
    sys.exit(1)

SOURCE = Path(sys.argv[1]).expanduser().resolve()
if not SOURCE.exists():
    print(f'source not found: {SOURCE}', file=sys.stderr)
    sys.exit(1)

REPO = Path(os.environ.get('VAULTCHAT_REPO', Path.home() / 'Desktop' / 'vaultchat')).expanduser().resolve()
if not REPO.exists():
    print(f'vaultchat repo not found at {REPO}', file=sys.stderr)
    sys.exit(1)

print(f'source: {SOURCE}')
print(f'repo:   {REPO}')
print()

src = Image.open(SOURCE).convert('RGBA')
W, H = src.size
print(f'source size: {W}x{H}')

if W != H:
    # crop to square (centered)
    side = min(W, H)
    src = src.crop((
        (W - side) // 2,
        (H - side) // 2,
        (W + side) // 2,
        (H + side) // 2,
    ))
    print(f'cropped to {side}x{side}')


def flatten_on_white(img: Image.Image) -> Image.Image:
    """Composite RGBA image onto a solid white background and return RGB."""
    bg = Image.new('RGB', img.size, (255, 255, 255))
    bg.paste(img, mask=img.split()[3] if img.mode == 'RGBA' else None)
    return bg


def save_png(img: Image.Image, path: Path, with_alpha: bool = True):
    path.parent.mkdir(parents=True, exist_ok=True)
    if with_alpha:
        img.save(path, 'PNG', optimize=True)
    else:
        flatten_on_white(img).save(path, 'PNG', optimize=True)
    print(f'  wrote {path.relative_to(REPO)}  ({img.size[0]}x{img.size[1]})')


# ─── iOS ──────────────────────────────────────────────────────────────
print('iOS App Icon:')
ios_icon_dir = REPO / 'ios' / 'VaultChat' / 'Images.xcassets' / 'AppIcon.appiconset'
# 1024 — App Store + base size Xcode uses to auto-derive others
icon_1024 = src.resize((1024, 1024), Image.LANCZOS)
save_png(icon_1024, ios_icon_dir / 'App-Icon-1024x1024@1x.png', with_alpha=False)


# ─── Android — square launcher icons (legacy, pre-Android 8) ─────────
print()
print('Android legacy launcher icons:')
ANDROID_RES = REPO / 'android' / 'app' / 'src' / 'main' / 'res'
densities = {
    'mdpi':    48,
    'hdpi':    72,
    'xhdpi':   96,
    'xxhdpi':  144,
    'xxxhdpi': 192,
}
for bucket, size in densities.items():
    out = ANDROID_RES / f'mipmap-{bucket}' / 'ic_launcher.png'
    img = src.resize((size, size), Image.LANCZOS)
    save_png(img, out, with_alpha=False)
    # Also write the round variant — Pixel launcher uses ic_launcher_round
    # for round-mask icon shapes.
    save_png(img, ANDROID_RES / f'mipmap-{bucket}' / 'ic_launcher_round.png', with_alpha=False)


# ─── Android — adaptive icon foreground (inset to safe zone) ─────────
print()
print('Android adaptive icon foreground:')
# Adaptive icon spec: 108x108 dp total, 72x72 dp safe zone in the middle.
# We pad the source down to fit the safe zone so it doesn't get clipped
# when launchers apply masks (circle, squircle, teardrop, etc.).
SAFE_RATIO = 72.0 / 108.0  # ~0.667
fg_sizes = {
    'mdpi':    108,
    'hdpi':    162,
    'xhdpi':   216,
    'xxhdpi':  324,
    'xxxhdpi': 432,
}
for bucket, total_size in fg_sizes.items():
    inner = int(round(total_size * SAFE_RATIO))
    pad   = (total_size - inner) // 2
    img = src.resize((inner, inner), Image.LANCZOS)
    canvas = Image.new('RGBA', (total_size, total_size), (255, 255, 255, 0))
    canvas.paste(img, (pad, pad), img if img.mode == 'RGBA' else None)
    save_png(canvas, ANDROID_RES / f'mipmap-{bucket}' / 'ic_launcher_foreground.png', with_alpha=True)


# ─── Android — adaptive icon background = white ──────────────────────
print()
print('Android adaptive icon background (white):')
colors_xml_dir = ANDROID_RES / 'values'
colors_xml_dir.mkdir(parents=True, exist_ok=True)
colors_xml = colors_xml_dir / 'ic_launcher_background.xml'
colors_xml.write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n'
    '<resources>\n'
    '    <color name="ic_launcher_background">#FFFFFFFF</color>\n'
    '</resources>\n',
    encoding='utf-8',
)
print(f'  wrote {colors_xml.relative_to(REPO)}')

# anydpi adaptive icon XML referencing the foreground + background
anydpi_dir = ANDROID_RES / 'mipmap-anydpi-v26'
anydpi_dir.mkdir(parents=True, exist_ok=True)
for name in ('ic_launcher.xml', 'ic_launcher_round.xml'):
    (anydpi_dir / name).write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <background android:drawable="@color/ic_launcher_background"/>\n'
        '    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n'
        '</adaptive-icon>\n',
        encoding='utf-8',
    )
    print(f'  wrote {(anydpi_dir / name).relative_to(REPO)}')


# ─── Expo asset (used by app.json icon: "./assets/icon.png") ──────────
print()
print('Expo assets (app.json):')
expo_assets_dir = REPO / 'assets'
if expo_assets_dir.exists():
    save_png(icon_1024, expo_assets_dir / 'icon.png', with_alpha=False)
    save_png(icon_1024, expo_assets_dir / 'adaptive-icon.png', with_alpha=False)
else:
    print('  skipped — no /assets directory')

print()
print('done — all iOS + Android icons regenerated from', SOURCE.name)
