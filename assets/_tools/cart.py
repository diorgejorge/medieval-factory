"""Carroça puxada por burro (cart_e/s/w/n, 2 quadros): burro do pacote Ninja Adventure, caçamba desenhada por nós.

O pacote só tem o burro de frente e de lado; a vista de costas (cart_n) sai da de frente, trocando o focinho e os
olhos pelo cinza do corpo.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageOps

from machines import IRON, OUTLINE, WOOD, Sprite
from transport import fill

ANIMALS = Path(__file__).resolve().parent.parent / "vendor" / "ninja-adventure" / "animals"
WALK_FRAMES = 2
CLOTH = (0xE8, 0xE2, 0xD8)  # sacos de carga
MUZZLE = (242, 173, 125)
COAT = (155, 167, 170)


def strip(sheet: Image.Image, frames: int) -> list[Image.Image]:
    w = sheet.width // frames
    return [sheet.crop((i * w, 0, (i + 1) * w, sheet.height)) for i in range(frames)]


def back_view(front: Image.Image) -> Image.Image:
    """Costas: focinho vira pelo e o contorno no meio da cara (olhos) também."""
    img = front.copy()
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if not a:
                continue
            if (r, g, b) == MUZZLE:
                px[x, y] = (*COAT, a)
            elif (r, g, b) == OUTLINE and all(
                0 <= x + dx < w and 0 <= y + dy < h and px[x + dx, y + dy][3]
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
            ):
                px[x, y] = (*COAT, a)
    return img


def wheel(sp: Sprite, cx: int, cy: int, r: int) -> None:
    for y in range(cy - r, cy + r + 1):
        for x in range(cx - r, cx + r + 1):
            d2 = (x - cx) ** 2 + (y - cy) ** 2
            if d2 <= r * r:
                rim = d2 >= (r - 1) ** 2
                spoke = x == cx or y == cy
                sp.put(x, y, WOOD[0] if rim else WOOD[2] if spoke else WOOD[1])
    sp.put(cx, cy, IRON[2])


def wagon_side() -> Image.Image:
    """Caçamba de perfil (16x16), varal saindo para a direita."""
    sp = Sprite(18, 16)
    fill(sp, 1, 1, 6, 3, CLOTH)          # sacos
    fill(sp, 7, 2, 11, 3, CLOTH)
    fill(sp, 0, 4, 13, 4, WOOD[2])       # borda
    fill(sp, 0, 5, 13, 9, WOOD[1])
    fill(sp, 0, 7, 13, 7, WOOD[0])       # tábua
    fill(sp, 13, 9, 17, 9, WOOD[0])      # varal
    wheel(sp, 6, 11, 4)
    sp.outline()
    return sp.image()


def wagon_front() -> Image.Image:
    """Caçamba de frente/de trás (16x14): rodas nas laterais."""
    sp = Sprite(16, 14)
    fill(sp, 2, 0, 13, 2, CLOTH)
    fill(sp, 1, 3, 14, 3, WOOD[2])
    fill(sp, 1, 4, 14, 10, WOOD[1])
    fill(sp, 1, 7, 14, 7, WOOD[0])
    for x in (0, 15):
        fill(sp, x, 6, x, 13, WOOD[0])
        sp.put(x, 10, IRON[2])
    sp.outline()
    return sp.image()


def compose(size: tuple[int, int], parts: list[tuple[Image.Image, tuple[int, int]]]) -> Image.Image:
    img = Image.new("RGBA", size)
    for part, at in parts:
        img.alpha_composite(part, at)
    return img


def cart_frames() -> tuple[dict[str, Image.Image], dict[str, list[str]]]:
    side = strip(Image.open(ANIMALS / "DonkeySide.png").convert("RGBA"), WALK_FRAMES)
    front = strip(Image.open(ANIMALS / "DonkeyFront.png").convert("RGBA"), WALK_FRAMES)
    wagon, wagon_end = wagon_side(), wagon_front()
    east = [compose((40, 16), [(wagon, (0, 0)), (donkey, (17, 0))]) for donkey in side]
    sequences = {
        "cart_e": east,
        "cart_w": [ImageOps.mirror(f) for f in east],
        # Para o sul o burro vem na frente (embaixo); para o norte ele vai na frente (em cima), de costas.
        "cart_s": [compose((16, 26), [(wagon_end, (0, 0)), (donkey, (0, 10))]) for donkey in front],
        "cart_n": [compose((16, 26), [(back_view(donkey), (0, 0)), (wagon_end, (0, 12))]) for donkey in front],
    }
    frames: dict[str, Image.Image] = {}
    animations: dict[str, list[str]] = {}
    for name, images in sequences.items():
        animations[name] = [f"{name}_{i}" for i in range(len(images))]
        frames.update(zip(animations[name], images))
    return frames, animations
