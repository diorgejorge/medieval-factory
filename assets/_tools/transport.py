"""Transporte desenhado por nós: calha (chute) e esteira de roletes (belt).

Rotação no contrato do core (sentido horário a partir do sul): r0 = fluxo para o sul, r1 oeste, r2 norte,
r3 leste. Calha e esteira atravessam o tile de borda a borda no sentido do fluxo para emendar com a vizinha.
"""

from __future__ import annotations

from PIL import Image, ImageOps

from machines import FRAMES, IRON, OUTLINE, WOOD, Color, Sprite

TILE = 16
LEATHER = ((0x3A, 0x26, 0x22), (0x5A, 0x3C, 0x30))


def fill(sp: Sprite, x0: int, y0: int, x1: int, y1: int, color: Color) -> None:
    """Retângulo inclusivo [x0..x1] x [y0..y1]."""
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            sp.put(x, y, color)


def directions(south: list[Image.Image], east: list[Image.Image], name: str) -> dict[str, list[Image.Image]]:
    """Gera as 4 rotações a partir do desenho com fluxo para o sul (r0) e para o leste (r3)."""
    return {
        name: south,
        f"{name}_r1": [ImageOps.mirror(f) for f in east],
        f"{name}_r2": [ImageOps.flip(f) for f in south],
        f"{name}_r3": east,
    }


# ---------- calha ----------
# Peças rentes ao chão (sem pernas), de borda a borda no sentido do fluxo para emendar com a vizinha.

def chute_east() -> Image.Image:
    sp = Sprite(TILE, TILE)
    fill(sp, 0, 3, 15, 3, OUTLINE)
    fill(sp, 0, 4, 15, 4, WOOD[2])      # borda de trás
    fill(sp, 0, 5, 15, 9, WOOD[0])      # canal
    fill(sp, 0, 10, 15, 10, WOOD[2])    # borda da frente
    fill(sp, 0, 11, 15, 12, WOOD[1])    # parede da frente
    fill(sp, 0, 13, 15, 13, OUTLINE)
    for x in (3, 11):                   # emenda das tábuas
        fill(sp, x, 11, x, 12, WOOD[0])
    for cx in (5, 12):                  # setas do fluxo
        for dx, dy in ((0, 5), (1, 6), (2, 7), (1, 8), (0, 9)):
            sp.put(cx + dx - 1, dy, WOOD[1])
    return sp.image()


def chute_south() -> Image.Image:
    sp = Sprite(TILE, TILE)
    fill(sp, 2, 0, 2, 15, OUTLINE)
    fill(sp, 3, 0, 3, 15, WOOD[2])      # parede iluminada
    fill(sp, 4, 0, 11, 15, WOOD[0])     # canal
    fill(sp, 12, 0, 12, 15, WOOD[1])
    fill(sp, 13, 0, 13, 15, OUTLINE)
    for cy in (3, 11):
        for dx, dy in ((0, 0), (1, 1), (2, 2), (3, 2), (4, 1), (5, 0)):
            sp.put(5 + dx, cy + dy, WOOD[1])
    return sp.image()


# ---------- esteira ----------

def belt_east(frame: int) -> Image.Image:
    sp = Sprite(TILE, TILE)
    fill(sp, 0, 3, 15, 3, OUTLINE)
    fill(sp, 0, 4, 15, 4, WOOD[2])      # trilho de trás
    fill(sp, 0, 5, 15, 9, LEATHER[0])   # lona
    for x in range(TILE):               # ripas andando para o leste
        if (x - frame) % FRAMES == 0:
            fill(sp, x, 5, x, 9, LEATHER[1])
    fill(sp, 0, 10, 15, 10, WOOD[2])    # trilho da frente
    fill(sp, 0, 11, 15, 12, WOOD[1])
    for x in (3, 11):                   # cabeças dos roletes
        sp.put(x, 11, IRON[2])
        sp.put(x, 12, IRON[0])
    fill(sp, 0, 13, 15, 13, OUTLINE)
    return sp.image()


def belt_south(frame: int) -> Image.Image:
    sp = Sprite(TILE, TILE)
    fill(sp, 2, 0, 2, 15, OUTLINE)
    fill(sp, 3, 0, 3, 15, WOOD[2])
    fill(sp, 4, 0, 11, 15, LEATHER[0])
    for y in range(TILE):               # ripas andando para o sul
        if (y - frame) % FRAMES == 0:
            fill(sp, 4, y, 11, y, LEATHER[1])
    fill(sp, 12, 0, 12, 15, WOOD[1])
    fill(sp, 13, 0, 13, 15, OUTLINE)
    for y in (3, 11):
        sp.put(3, y, IRON[2])
        sp.put(12, y, IRON[0])
    return sp.image()


def transport_frames() -> tuple[dict[str, Image.Image], dict[str, list[str]]]:
    sequences: dict[str, list[Image.Image]] = {}
    sequences.update(directions([chute_south()], [chute_east()], "chute"))
    sequences.update(directions([belt_south(f) for f in range(FRAMES)],
                                [belt_east(f) for f in range(FRAMES)], "belt"))
    frames: dict[str, Image.Image] = {}
    animations: dict[str, list[str]] = {}
    for name, images in sequences.items():
        if len(images) == 1:
            frames[name] = images[0]
            continue
        animations[name] = [f"{name}_{i}" for i in range(len(images))]
        frames.update(zip(animations[name], images))
    return frames, animations
