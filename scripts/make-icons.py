"""生成两枚中性多尺寸 ICO 图标（正常态 / 伪装态），不依赖第三方库。

electron-builder 要求 ICO 至少含一张 256x256 图；同时保留小尺寸供托盘清晰显示。
绘图逻辑基于 32x32 虚拟网格按比例缩放，保证各尺寸视觉一致。
"""
import struct
import os

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")
SIZES = [16, 32, 48, 64, 128, 256]
GRID = 32


def pixel_on_grid(gx, gy, base, accent):
    """基于 32x32 虚拟网格判断一个点画什么颜色（BGRA）。"""
    edge, corner = 3, 5
    inside = edge <= gx < GRID - edge and edge <= gy < GRID - edge
    if inside:
        cx = min(gx - edge, GRID - 1 - edge - gx)
        cy = min(gy - edge, GRID - 1 - edge - gy)
        if cx < corner and cy < corner:
            dx, dy = corner - cx, corner - cy
            if dx * dx + dy * dy > corner * corner:
                return None
    else:
        return None
    if (8 <= gy <= 10 and 8 <= gx <= 23) or \
       (14 <= gy <= 16 and 8 <= gx <= 20) or \
       (20 <= gy <= 22 and 8 <= gx <= 17):
        ar, ag, ab = accent
        return (ab, ag, ar, 255)
    r, g, b = base
    return (b, g, r, 255)


def image_data(size, base, accent):
    rows = []
    for y in range(size - 1, -1, -1):
        for x in range(size):
            gx = x * GRID / size
            gy = y * GRID / size
            c = pixel_on_grid(gx, gy, base, accent)
            rows.append(c if c else (0, 0, 0, 0))
    pixels = b"".join(struct.pack("<4B", *p) for p in rows)
    mask = b"\x00" * (size // 8 * size)
    header = struct.pack(
        "<IiiHHIIiiII",
        40, size, size * 2, 1, 32, 0, len(pixels) + len(mask), 0, 0, 0, 0,
    )
    return header + pixels + mask


def make_ico(path, base, accent):
    images = [image_data(s, base, accent) for s in SIZES]
    offset = 6 + 16 * len(SIZES)
    entries = bytearray()
    for size, img in zip(SIZES, images):
        entries += struct.pack(
            "<BBBBHHII", size % 256, size % 256, 0, 0, 1, 32, len(img), offset
        )
        offset += len(img)
    data = struct.pack("<HHH", 0, 1, len(SIZES)) + bytes(entries) + b"".join(images)
    with open(path, "wb") as f:
        f.write(data)
    print("wrote", os.path.basename(path), len(data), "bytes", f"sizes={SIZES}")


if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    make_ico(os.path.join(OUT_DIR, "icon.ico"), (74, 94, 112), (225, 235, 242))
    make_ico(os.path.join(OUT_DIR, "icon-stealth.ico"), (120, 120, 120), (240, 240, 240))
