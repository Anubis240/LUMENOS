#!/usr/bin/env python3
"""Render dedicated 4:3 boot artwork, reserving the lower half for the menu.

Cropping the wide Plymouth splash cuts off its wordmark and orb. Keep this
deterministic composition separate, with the selectable menu drawn by the
bootloader itself rather than baked into the PNG.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import math

HERE = Path(__file__).resolve().parent
TARGETS = {
    HERE.parent.parent / "live-build" / "config" / "bootloaders" / "syslinux_common" / "splash.png": (640, 480),
    HERE.parent.parent / "live-build" / "config" / "bootloaders" / "grub-pc" / "splash.png": (800, 600),
}

W, H = 1600, 1200  # Reduce at export for clean firmware-resolution curves.


def font(size, bold=False):
    for path in (
        Path("C:/Windows/Fonts/seguisb.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ):
        if path.exists():
            return ImageFont.truetype(str(path), size)
    raise RuntimeError("Install Segoe UI or DejaVu Sans to regenerate the boot artwork.")


def render():
    image = Image.new("RGB", (W, H))
    pixels = image.load()
    for y in range(H):
        for x in range(W):
            glow = max(0, 1 - math.hypot((x - W * .77) / 590, (y - H * .24) / 400))
            pixels[x, y] = (5 + int(9 * glow), 7 + int(4 * glow), 21 + int(23 * glow))
    image = image.convert("RGBA")

    traces = Image.new("RGBA", image.size)
    draw = ImageDraw.Draw(traces)
    for i in range(5):
        y = 30 + i * 28
        draw.line([(0, y), (54, y), (78, y - 18), (224 + i * 36, y - 18)], fill=(43, 113, 229, 110), width=2)
        x = 224 + i * 36
        draw.ellipse((x-3, y-21, x+3, y-15), fill=(70, 139, 247, 180))
    for i in range(5):
        y = H - 28 - i * 25
        draw.line([(W, y), (W-72, y), (W-100, y-23), (W-200-i*35, y-23)], fill=(114, 67, 211, 100), width=2)
    image = Image.alpha_composite(image, traces)

    orb = Image.new("RGBA", image.size)
    draw = ImageDraw.Draw(orb)
    cx, cy, radius = 1215, 276, 177
    for r, alpha, width in ((230, 40, 2), (210, 55, 2), (radius, 235, 3), (164, 85, 2), (132, 145, 2)):
        draw.ellipse((cx-r, cy-r, cx+r, cy+r), outline=(171, 110, 255, alpha), width=width)
    petal = 81
    for angle in range(0, 360, 60):
        a = math.radians(angle)
        px, py = cx + math.cos(a) * petal * .72, cy + math.sin(a) * petal * .72
        draw.ellipse((px-petal, py-petal, px+petal, py+petal), outline=(228, 207, 255, 190), width=2)
    for angle in range(0, 360, 30):
        a = math.radians(angle)
        px, py = cx + math.cos(a) * radius, cy + math.sin(a) * radius
        draw.ellipse((px-3, py-3, px+3, py+3), fill=(232, 211, 255, 225))
    for sy in (cy-radius, cy, cy+radius):
        draw.line((cx-18, sy, cx+18, sy), fill=(228, 210, 255, 230), width=2)
        draw.line((cx, sy-18, cx, sy+18), fill=(228, 210, 255, 230), width=2)
        draw.ellipse((cx-4, sy-4, cx+4, sy+4), fill=(255, 255, 255, 255))
    image = Image.alpha_composite(image, orb.filter(ImageFilter.GaussianBlur(10)))
    image = Image.alpha_composite(image, orb)

    draw = ImageDraw.Draw(image)
    draw.text((112, 191), "LUMEN OS", font=font(104, True), fill=(247, 244, 255))
    draw.text((116, 330), "THE FUTURE HAS A SOUL", font=font(29), fill=(194, 175, 222))
    return image.convert("RGB")


if __name__ == "__main__":
    artwork = render()
    for output, size in TARGETS.items():
        output.parent.mkdir(parents=True, exist_ok=True)
        artwork.resize(size, Image.Resampling.LANCZOS).save(output, optimize=True)
        print(output)
