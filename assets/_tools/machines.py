"""Máquinas da fábrica desenhadas por nós no traço do pacote Ninja Adventure.

Regras do traço: contorno OUTLINE de 1 px, 3 tons por material (claro, médio, escuro), luz do noroeste.
Cada função devolve os quadros da animação (lista de imagens RGBA do mesmo tamanho).
"""

from __future__ import annotations

import math

from PIL import Image

# Cores tiradas do próprio pacote (TilesetHouse/TilesetNature), para as máquinas casarem com o resto.
OUTLINE = (0x14, 0x1B, 0x1B)
WOOD = ((0x61, 0x37, 0x2E), (0x96, 0x53, 0x40), (0xC6, 0x94, 0x69))
IRON = ((0x4A, 0x52, 0x70), (0x75, 0x98, 0x92), (0xD3, 0xDA, 0xD4))
FIRE = ((0xE0, 0x39, 0x4C), (0xE4, 0x6D, 0x3A), (0xFF, 0xAD, 0x5D), (0xFF, 0xE1, 0x66))

FRAMES = 4
Color = tuple[int, int, int]


class Sprite:
    """Grade de pixels com contorno automático em volta da silhueta."""

    def __init__(self, w: int, h: int) -> None:
        self.w, self.h = w, h
        self.px: list[list[Color | None]] = [[None] * w for _ in range(h)]

    def put(self, x: int, y: int, color: Color) -> None:
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y][x] = color

    def filled(self, x: int, y: int) -> bool:
        return 0 <= x < self.w and 0 <= y < self.h and self.px[y][x] is not None

    def outline(self) -> None:
        edge = [(x, y) for y in range(self.h) for x in range(self.w)
                if self.px[y][x] and any(not self.filled(x + dx, y + dy)
                                         for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
        for x, y in edge:
            self.px[y][x] = OUTLINE

    def image(self) -> Image.Image:
        img = Image.new("RGBA", (self.w, self.h))
        img.putdata([(*c, 255) if c else (0, 0, 0, 0) for row in self.px for c in row])
        return img


# ---------- eixo ----------

def shaft(log: Image.Image, horizontal: bool) -> list[Image.Image]:
    """Eixo feito do tronco do pacote, com cintas de ferro e um poste de apoio no meio do tile.

    `log` é um trecho vertical de tronco 16x16 do pacote. Atravessa o tile de borda a borda para emendar
    com o vizinho; a cinta de ferro com um rebite que dá a volta mostra o giro em 4 quadros.
    """
    trunk = log.crop((2, 0, 14, 16)).resize((8, 16), Image.NEAREST)  # tronco mais fino: 8 px de diâmetro
    frames = []
    for f in range(FRAMES):
        img = Image.new("RGBA", (16, 16))
        body = Image.new("RGBA", (8, 16))
        body.paste(trunk, (0, 0))
        for y in (3, 4, 11, 12):  # cintas de ferro
            for x in range(8):
                tone = 2 if x < 2 else 0 if x > 5 else 1
                body.putpixel((x, y), (*IRON[tone], 255))
        for y in (3, 11):  # rebite que anda em volta do eixo
            body.putpixel((1 + 2 * f if f < 3 else 6, y), (*OUTLINE, 255))
        for y in range(16):  # contorno nas laterais compridas
            body.putpixel((0, y), (*OUTLINE, 255))
            body.putpixel((7, y), (*OUTLINE, 255))
        if horizontal:
            body = body.transpose(Image.ROTATE_270)  # 16x8, lado claro para cima
            post = Image.new("RGBA", (4, 5), (*OUTLINE, 255))
            post.paste(Image.new("RGBA", (2, 4), (*WOOD[1], 255)), (1, 0))
            img.alpha_composite(post, (6, 11))
            img.alpha_composite(body, (0, 3))
        else:
            img.alpha_composite(body, (4, 0))
        frames.append(img)
    return frames


# ---------- engrenagem ----------

def gear(size: int, teeth: int) -> list[Image.Image]:
    """Roda dentada de madeira vista de cima, cubo de ferro; gira um dente a cada ciclo de 4 quadros."""
    frames = []
    c = (size - 1) / 2
    r_body, r_tooth, r_hub = size * 0.37, size * 0.48, size * 0.1
    step = math.tau / teeth
    for f in range(FRAMES):
        sp = Sprite(size, size)
        phase = f * step / FRAMES
        for y in range(size):
            for x in range(size):
                dx, dy = x - c, y - c
                d = math.hypot(dx, dy)
                ang = (math.atan2(dy, dx) - phase) % step
                is_tooth = abs(ang - step / 2) < step * 0.3
                if d > (r_tooth if is_tooth else r_body):
                    continue
                lit = -(dx + dy) / (size * 0.7)
                if d <= r_hub:
                    color = IRON[2] if lit > 0.05 else IRON[1]
                elif d <= r_hub + 1.2:
                    color = IRON[0]
                else:
                    tone = 2 if lit > 0.25 else 1 if lit > -0.25 else 0
                    color = WOOD[tone]
                    # raios da roda: giram junto
                    spoke = (math.atan2(dy, dx) - phase) % (math.tau / 4)
                    if d < r_body - 1.5 and min(spoke, math.tau / 4 - spoke) < 0.16:
                        color = WOOD[max(tone - 1, 0)]
                sp.put(x, y, color)
        sp.outline()
        frames.append(sp.image())
    return frames


# ---------- engrenagem em pé ----------

def framed_gear(gear_frames: list[Image.Image]) -> list[Image.Image]:
    """Engrenagem grande de pé numa armação de madeira (como num moinho), vista de frente."""
    out = []
    for g in gear_frames:
        img = Image.new("RGBA", (32, 40))
        for x0 in (1, 27):  # postes
            for y in range(6, 40):
                for x in range(x0, x0 + 4):
                    edge = x in (x0, x0 + 3) or y == 6
                    img.putpixel((x, y), (*(OUTLINE if edge else WOOD[2] if x == x0 + 1 else WOOD[1]), 255))
        for y in range(34, 40):  # viga de base
            for x in range(1, 31):
                edge = y in (34, 39) or x in (1, 30)
                img.putpixel((x, y), (*(OUTLINE if edge else WOOD[1] if y < 37 else WOOD[0]), 255))
        for x in range(4, 28):  # eixo atravessando a armação
            for y in range(15, 19):
                tone = 2 if y == 16 else 0 if y == 18 else 1
                img.putpixel((x, y), (*(OUTLINE if y == 15 else WOOD[tone]), 255))
        img.alpha_composite(g, (0, 1))
        out.append(img)
    return out


def machine_frames(nature: Image.Image) -> tuple[dict[str, Image.Image], dict[str, list[str]]]:
    log = nature.crop((12 * 16, 14 * 16 + 8, 13 * 16, 15 * 16 + 8))
    frames: dict[str, Image.Image] = {}
    animations: dict[str, list[str]] = {}
    for name, images in (
        ("shaft_h", shaft(log, horizontal=True)),
        ("shaft_v", shaft(log, horizontal=False)),
        ("gear_small", gear(16, 8)),
        ("gear_large", framed_gear(gear(32, 12))),
    ):
        animations[name] = [f"{name}_{i}" for i in range(len(images))]
        frames.update(zip(animations[name], images))
    return frames, animations
