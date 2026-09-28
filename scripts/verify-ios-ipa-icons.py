"""Check actual shipped icon pixels, including Apple's CgBI PNG encoding."""
import argparse
import plistlib
import struct
import zlib
import zipfile
from pathlib import Path


def png_pixels(data):
    offset, compressed, cgbi = 8, [], False
    while offset < len(data):
        size = struct.unpack('>I', data[offset:offset + 4])[0]
        kind = data[offset + 4:offset + 8]
        body = data[offset + 8:offset + 8 + size]
        offset += size + 12
        if kind == b'CgBI':
            cgbi = True
        elif kind == b'IHDR':
            width, height, depth, color, _, _, interlace = struct.unpack('>IIBBBBB', body)
        elif kind == b'IDAT':
            compressed.append(body)
    if depth != 8 or color not in (2, 6) or interlace:
        raise ValueError('Expected a noninterlaced RGB/RGBA 8-bit app icon')
    channels = 4 if color == 6 else 3
    stride = width * channels
    raw = zlib.decompress(b''.join(compressed), -15 if cgbi else 15)
    if len(raw) != (stride + 1) * height:
        raise ValueError('Invalid app icon scanline size')
    prior, pixels = bytearray(stride), bytearray()
    for y in range(height):
        base = y * (stride + 1)
        mode = raw[base]
        row = bytearray(raw[base + 1:base + 1 + stride])
        for i in range(stride):
            a = row[i - channels] if i >= channels else 0
            b = prior[i]
            c = prior[i - channels] if i >= channels else 0
            if mode == 0:
                predictor = 0
            elif mode == 1:
                predictor = a
            elif mode == 2:
                predictor = b
            elif mode == 3:
                predictor = (a + b) // 2
            elif mode == 4:
                p = a + b - c
                predictor = min((a, b, c), key=lambda v: abs(p - v))
            else:
                raise ValueError('Unknown PNG filter')
            row[i] = (row[i] + predictor) & 255
        prior = row
        for i in range(0, stride, channels):
            r, g, b = row[i:i + 3]
            alpha = row[i + 3] if channels == 4 else 255
            if cgbi:
                r, b = b, r
                if 0 < alpha < 255:
                    r, g, b = [min(255, round(v * 255 / alpha)) for v in (r, g, b)]
            pixels.extend((r, g, b, alpha))
    return width, height, pixels


def verify(ipa, source):
    with zipfile.ZipFile(ipa) as archive:
        plists = [n for n in archive.namelist() if n.startswith('Payload/')
                  and n.endswith('.app/Info.plist') and n.count('/') == 2]
        if len(plists) != 1:
            raise ValueError('Expected one main app in IPA')
        root = plists[0].rsplit('/', 1)[0]
        info = plistlib.loads(archive.read(plists[0]))
        for key in ('CFBundleIcons', 'CFBundleIcons~ipad'):
            if info[key]['CFBundlePrimaryIcon']['CFBundleIconName'] != 'AppIcon':
                raise ValueError('Unexpected primary app icon catalog')
        for bundled, original in (
            ('AppIcon60x60@2x.png', 'AppIcon-60x60@2x.png'),
            ('AppIcon76x76@2x~ipad.png', 'AppIcon-76x76@2x.png'),
        ):
            actual = png_pixels(archive.read(root + '/' + bundled))
            expected = png_pixels((source / original).read_bytes())
            if actual[:2] != expected[:2] or len(actual[2]) != len(expected[2]):
                raise ValueError(f'Incorrect installed icon dimensions: {bundled}')
            if any(abs(a - b) > 1 for a, b in zip(actual[2], expected[2])):
                raise ValueError(f'Installed icon differs from approved artwork: {bundled}')
        print('Verified shipped iPhone and iPad icons against approved artwork')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('ipa', type=Path)
    parser.add_argument('--source', type=Path, default=Path('src-tauri/icons/ios'))
    args = parser.parse_args()
    verify(args.ipa, args.source)
