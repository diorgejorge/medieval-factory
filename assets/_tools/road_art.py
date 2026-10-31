"""Estrada de terra no estilo da referência do usuário (assets/source/terrain/road_ref.jpeg).

Areia bege com sulcos de roda suaves, pegadas e pedrinhas; nas pontas sem vizinha a grama invade com borda
irregular e tufos. Arte em HD (32x32 = 1 tile, densidade 2). Frames: `road[_<lados>]_<variante>`, lados na
ordem n, e, s, w; o render emenda as vizinhas e sorteia a variante pela posição.
"""

from __future__ import annotations

import math
from itertools import combinations

from PIL import Image

Color = tuple[int, int, int]

SIZE = 32
VARIANTS = 4
SIDES = "nesw"

# Cores tiradas da referência.
LIGHT, SAND, MID, SHADE, RIM = (254, 225, 155), (242, 207, 137), (220, 177, 122), (198, 156, 108), (170, 128, 86)
GRASS_DARK, GRASS, GRASS_LIGHT = (34, 54, 43), (64, 91, 51), (110, 150, 60)
STONE = ((65, 52, 54), (143, 126, 115), (199, 172, 132))
LEAF = (205, 140, 70)

EDGE_DEPTH = 4        # quanto a grama entra a partir de um lado aberto
EDGE_WOBBLE = 2.5     # amplitude da borda irregular
RUT_OFFSETS = (9, 22)  # distância dos sulcos à borda, igual nos dois sentidos para emendar
STEP = {"n": (0, -1), "e": (1, 0), "s": (0, 1), "w": (-1, 0)}


def noise(x: int, y: int, salt: int) -> float:
    """Ruído fixo em [0, 1) por pixel: a mesma build sempre gera a mesma arte."""
    n = (x * 374761393 + y * 668265263 + salt * 2147483647) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return (n ^ (n >> 16)) / 2**32


def edge_depth(side: str, t: int, variant: int) -> float:
    """Profundidade da grama ao longo do lado; vale EDGE_DEPTH nas pontas, para emendar com o vizinho."""
    k = 1 + (variant + "nesw".index(side)) % 3
    sign = 1 if (variant + ord(side)) % 2 else -1
    return EDGE_DEPTH + sign * EDGE_WOBBLE * math.sin(math.pi * k * t / SIZE)


def distance_to(side: str, x: int, y: int) -> tuple[int, int]:
    """(distância até o lado, posição ao longo dele)."""
    return {"n": (y, x), "s": (SIZE - 1 - y, x), "w": (x, y), "e": (SIZE - 1 - x, y)}[side]


CORNERS = (("n", "e"), ("e", "s"), ("s", "w"), ("w", "n"))


def is_grass(connected: str, x: int, y: int, variant: int) -> bool:
    # Canto de dentro (dois lados vizinhos ligados): a grama das vizinhas fecha o quadrado do canto.
    for a, b in CORNERS:
        if a in connected and b in connected:
            depth_a, _ = distance_to(a, x, y)
            depth_b, _ = distance_to(b, x, y)
            if depth_a < EDGE_DEPTH and depth_b < EDGE_DEPTH:
                return True
    for side in SIDES:
        if side in connected:
            continue
        depth, along = distance_to(side, x, y)
        if depth < edge_depth(side, along, variant):
            return True
    return False


def rut_distance(connected: str, x: int, y: int) -> float:
    """Distância até o sulco mais perto: arcos na curva (dois lados vizinhos), retas do lado até o meio nos
    outros casos. Os sulcos ondulam de leve, como marcas de roda na areia fofa."""
    px, py = x + 0.5, y + 0.5
    if len(connected) == 2 and connected not in ("ns", "ew"):
        cx = SIZE if "e" in connected else 0
        cy = SIZE if "s" in connected else 0
        radius = math.hypot(px - cx, py - cy)
        return min(abs(radius - (SIZE - offset)) for offset in RUT_OFFSETS)
    best = math.inf
    middle = SIZE // 2
    for side in connected:
        across, along = (px, py) if side in "ns" else (py, px)
        reaches = along <= middle + RUT_OFFSETS[0] if side in "nw" else along >= middle - RUT_OFFSETS[0]
        if not reaches:
            continue
        sway = 0.6 * math.sin(math.pi * 2 * along / SIZE)  # volta ao centro nas bordas: emenda
        best = min(best, *(abs(across - offset - 0.5 - sway) for offset in RUT_OFFSETS))
    return best


def sand(x: int, y: int, variant: int) -> Color:
    # Manchas claras grandes (vento) e pintas médias, como na referência.
    wave = math.sin((x + 2 * y) / 5 + variant) + math.sin((x - y) / 7 + 2 * variant)
    speck = noise(x, y, variant)
    if wave > 1.1:
        return LIGHT
    if speck < 0.06 or wave < -1.2:
        return MID
    return SAND


def road(connected: str, variant: int) -> Image.Image:
    img = Image.new("RGBA", (SIZE, SIZE))
    px = img.load()
    grass = [[is_grass(connected, x, y, variant) for x in range(SIZE)] for y in range(SIZE)]
    for y in range(SIZE):
        for x in range(SIZE):
            if grass[y][x]:
                continue
            near_grass = any(0 <= x + dx < SIZE and 0 <= y + dy < SIZE and grass[y + dy][x + dx]
                             for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
            if near_grass:
                color = RIM
            elif (rut := rut_distance(connected, x, y)) < 0.8:
                color = SHADE if noise(x, y, 3) > 0.25 else MID
            elif rut < 1.9:
                color = MID if noise(x, y, 5) > 0.2 else SAND
            else:
                color = sand(x, y, variant)
            px[x, y] = (*color, 255)
    tufts(px, grass, variant)
    pebbles(px, grass, variant)
    footprints(px, grass, connected, variant)
    return img


def tufts(px, grass: list[list[bool]], variant: int) -> None:
    """Tufos de capim saindo da grama por cima da areia, na borda."""
    for y in range(1, SIZE - 1):
        for x in range(1, SIZE - 1):
            if not grass[y][x] or noise(x, y, 40 + variant) > 0.06:
                continue
            for i, (dx, dy) in enumerate(((0, 0), (0, -1), (-1, -1), (1, -2), (0, -2))):
                bx, by = x + dx, y + dy
                if 0 <= bx < SIZE and 0 <= by < SIZE:
                    px[bx, by] = (*(GRASS_LIGHT if i > 2 else GRASS), 255)
            if y + 1 < SIZE:
                px[x, y + 1] = (*GRASS_DARK, 255)


def pebbles(px, grass: list[list[bool]], variant: int) -> None:
    for i in range(1 + variant % 2):
        x = 5 + int(noise(i, variant, 7) * (SIZE - 10))
        y = 5 + int(noise(variant, i, 9) * (SIZE - 10))
        if grass[y][x]:
            continue
        big = noise(x, y, 11) > 0.6
        cells = ((0, 0), (1, 0), (0, 1), (1, 1)) if big else ((0, 0),)
        for dx, dy in cells:
            px[x + dx, y + dy] = (*STONE[1], 255)
        px[x, y] = (*STONE[2], 255)
        px[x + (2 if big else 1), y + (1 if big else 0)] = (*STONE[0], 255)


def footprints(px, grass: list[list[bool]], connected: str, variant: int) -> None:
    """Pegadas: pares de pontinhos médios ao longo do meio da estrada."""
    if not connected:
        return
    vertical = any(side in connected for side in "ns")
    for i in range(3):
        along = 4 + i * 10 + int(noise(i, variant, 21) * 4)
        across = SIZE // 2 + (2 if i % 2 else -3)
        x, y = (across, along) if vertical else (along, across)
        for dx, dy in ((0, 0), (1, 0)) if vertical else ((0, 0), (0, 1)):
            if not grass[y + dy][x + dx]:
                px[x + dx, y + dy] = (*MID, 255)


def road_frames() -> dict[str, Image.Image]:
    names = [""] + ["".join(c) for size in range(1, len(SIDES) + 1) for c in combinations(SIDES, size)]
    frames: dict[str, Image.Image] = {}
    for connected in names:
        base = f"road_{connected}" if connected else "road"
        for variant in range(VARIANTS):
            frames[f"{base}_{variant}"] = road(connected, variant)
        frames[base] = frames[f"{base}_0"]
    return frames
