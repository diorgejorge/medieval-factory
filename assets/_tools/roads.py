"""Pátio das carroças (cart_yard, 4x4), desenhado por nós, e a estrada (arte em road_art.py)."""

from __future__ import annotations

from PIL import Image

from machines import IRON, OUTLINE, WOOD, Color, Sprite
from road_art import road_frames
from transport import TILE, fill

DIRT = ((0x6E, 0x4A, 0x30), (0x9C, 0x70, 0x48), (0xB8, 0x8A, 0x5A), (0xD4, 0xA8, 0x74))
STRAW = ((0xB0, 0x7A, 0x2A), (0xE0, 0xB0, 0x48), (0xFF, 0xE1, 0x66))
WATER = (0x4A, 0x8E, 0xC8)
YARD_W, YARD_H = 4 * TILE + 4, 4 * TILE + 12


def speckle(x: int, y: int, salt: int = 0) -> int:
    """Ruído fixo por pixel, para a terra não ficar lisa nem mudar entre builds."""
    return (x * 73 + y * 151 + salt * 37 + (x * y) % 11) % 23


def dirt(x: int, y: int) -> Color:
    n = speckle(x, y)
    return DIRT[3] if n == 0 else DIRT[1] if n < 3 else DIRT[2]


def fence(sp: Sprite, x0: int, y0: int, x1: int, y1: int, gate: range = range(0)) -> None:
    """Cerca de travessas claras com mourões escuros a cada 6 px; `gate` deixa a passagem aberta."""
    if y0 == y1:  # frente: travessas de pé, vistas de lado
        for x in range(x0, x1 + 1):
            if x in gate:
                continue
            post = (x - x0) % 6 == 0
            fill(sp, x, y0 - 6, x, y0, WOOD[0]) if post else (sp.put(x, y0 - 5, WOOD[2]), sp.put(x, y0 - 2, WOOD[1]))
        return
    for y in range(y0, y1 + 1):  # lados: vistos de cima, uma faixa de 2 px
        post = (y - y0) % 6 == 0
        fill(sp, x0, y, x0 + 1, y, WOOD[0] if post else WOOD[2])


def cart_yard() -> Image.Image:
    sp = Sprite(YARD_W, YARD_H)
    floor_top = 12
    for y in range(floor_top, YARD_H):
        for x in range(2, YARD_W - 2):
            sp.put(x, y, dirt(x, y))
    # Estábulo no fundo: telhado de palha, paredes de tábua e porta escura.
    fill(sp, 6, 14, 38, 30, WOOD[1])
    for x in range(6, 39, 4):
        fill(sp, x, 14, x, 30, WOOD[0])
    fill(sp, 17, 20, 27, 30, OUTLINE)
    fill(sp, 18, 21, 26, 30, (0x2A, 0x1E, 0x1A))
    for y in range(2, 16):
        for x in range(4 - (y - 2) // 4, 41 + (y - 2) // 4):
            sp.put(x, y, STRAW[2] if y < 4 else STRAW[(x + y) % 3 and 1])
    fill(sp, 3, 15, 41, 15, STRAW[0])
    # Fardos de feno e cocho com água.
    for bx, by in ((46, 20), (54, 22), (48, 28)):
        fill(sp, bx, by, bx + 8, by + 6, STRAW[1])
        fill(sp, bx, by, bx + 8, by, STRAW[2])
        fill(sp, bx + 4, by, bx + 4, by + 6, STRAW[0])
    fill(sp, 8, 56, 24, 62, WOOD[1])
    fill(sp, 10, 57, 22, 59, WATER)
    fill(sp, 8, 62, 24, 62, WOOD[0])
    sp.put(16, 58, IRON[2])
    # Cerca nos lados e na frente, com o portão no meio da frente.
    fence(sp, 3, 18, 3, YARD_H - 2)
    fence(sp, YARD_W - 5, 18, YARD_W - 5, YARD_H - 2)
    fence(sp, 3, YARD_H - 2, YARD_W - 4, YARD_H - 2, gate=range(24, 44))
    sp.outline()
    return sp.image()


def road_and_yard_frames() -> dict[str, Image.Image]:
    return {**road_frames(), "cart_yard": cart_yard()}
