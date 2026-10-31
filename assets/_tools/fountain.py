"""Chafariz de pedra (2x2 tiles) vista 3/4, seco e funcionando, e o ícone do item água.

Desenho em camadas: bacia, coluna e água são Sprites separados, cada um com o próprio contorno, empilhados
na ordem de trás para a frente. A base da bacia toca a última linha da imagem (âncora do objeto).
"""

from __future__ import annotations

from PIL import Image

from items import centered
from machines import FRAMES, OUTLINE, WOOD, Color, Sprite
from transport import fill

WIDTH, HEIGHT = 36, 40  # 2 tiles + 4 px de folga, até 40 px de altura
CX = WIDTH / 2  # eixo vertical do chafariz

STONE = ((0x55, 0x5A, 0x6A), (0x8A, 0x8F, 0x9A), (0xC8, 0xCC, 0xD0))  # escuro, médio, claro
MORTAR = (0x45, 0x48, 0x56)
HOLLOW = ((0x2A, 0x2E, 0x3A), (0x3A, 0x3E, 0x4C))  # fundo da bacia seca: chão, parede interna
WATER = ((0x2E, 0x5E, 0x98), (0x4A, 0x8E, 0xC8), (0x9C, 0xD4, 0xF0), (0xFF, 0xFF, 0xFF))  # fundo..espuma

# bacia: elipse do topo + parede da frente
BASIN_CY, BASIN_RX, BASIN_RY = 26.0, 17.5, 7.0
INNER_CY, INNER_RX, INNER_RY = 26.5, 14.5, 4.8
WALL = 7
# coluna central e prato de cima
PILLAR_X0, PILLAR_X1 = 16, 19
BOWL_CY, BOWL_RX, BOWL_RY, BOWL_WALL = 13.0, 8.5, 3.5, 2
BOWL_INNER_RX, BOWL_INNER_RY = 6.5, 2.3
FINIAL_TOP = 6  # topo da bica; o jato sobe acima disso


def in_ellipse(x: int, y: int, cy: float, rx: float, ry: float) -> bool:
    """Centro do pixel dentro da elipse de eixo em CX."""
    return ((x + 0.5 - CX) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1


def side_tone(x: int, x0: float, x1: float) -> int:
    """Tom da pedra pela posição horizontal: luz do noroeste, lado direito na sombra."""
    t = (x + 0.5 - x0) / (x1 - x0)
    return 2 if t < 0.25 else 1 if t < 0.7 else 0


def stack(*layers: Sprite) -> Image.Image:
    """Empilha as camadas, a primeira atrás."""
    img = Image.new("RGBA", (WIDTH, HEIGHT))
    for layer in layers:
        img.alpha_composite(layer.image())
    return img


# ---------- bacia ----------

def basin_wall(sp: Sprite) -> None:
    """Parede da frente em blocos de pedra com rejunte desencontrado."""
    for y in range(HEIGHT):
        for x in range(WIDTH):
            top = in_ellipse(x, y, BASIN_CY, BASIN_RX, BASIN_RY)
            body = in_ellipse(x, y - WALL, BASIN_CY, BASIN_RX, BASIN_RY) or (
                y + 0.5 >= BASIN_CY and y + 0.5 <= BASIN_CY + WALL and abs(x + 0.5 - CX) <= BASIN_RX)
            if top or not body:
                continue
            course = (y - int(BASIN_CY)) // 4  # fiada de blocos
            joint = (x + 3 * course) % 7 == 0
            mortar_row = (y - int(BASIN_CY)) % 4 == 3
            color = MORTAR if joint or mortar_row else STONE[side_tone(x, CX - BASIN_RX, CX + BASIN_RX)]
            sp.put(x, y, color)


def basin_rim(sp: Sprite) -> None:
    """Borda de cima da bacia: anel claro entre a elipse de fora e a de dentro."""
    for y in range(HEIGHT):
        for x in range(WIDTH):
            if in_ellipse(x, y, BASIN_CY, BASIN_RX, BASIN_RY) and not in_ellipse(
                    x, y, INNER_CY, INNER_RX, INNER_RY):
                front = y + 0.5 > BASIN_CY
                tone = 1 if front and x + 0.5 > CX + 4 else 2
                sp.put(x, y, STONE[tone])


def inner_edge(x: int, y: int, cy: float, rx: float, ry: float) -> bool:
    """Pixel de dentro da elipse encostado na borda dela."""
    return any(not in_ellipse(x + dx, y + dy, cy, rx, ry) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))


def hollow(sp: Sprite, cy: float, rx: float, ry: float, water: Color | None) -> None:
    """Cavidade elíptica: buraco escuro (seco) ou água; a borda interna leva o contorno."""
    for y in range(HEIGHT):
        for x in range(WIDTH):
            if not in_ellipse(x, y, cy, rx, ry):
                continue
            if inner_edge(x, y, cy, rx, ry):
                sp.put(x, y, OUTLINE)
            elif water:
                sp.put(x, y, water)
            else:
                sp.put(x, y, HOLLOW[1] if y + 0.5 < cy - 0.5 else HOLLOW[0])  # parede interna em cima


def basin(water: Color | None) -> Sprite:
    sp = Sprite(WIDTH, HEIGHT)
    basin_wall(sp)
    basin_rim(sp)
    sp.outline()
    hollow(sp, INNER_CY, INNER_RX, INNER_RY, water)
    return sp


# ---------- coluna ----------

def column() -> Sprite:
    """Fuste da coluna, do prato até o pé dentro da bacia."""
    sp = Sprite(WIDTH, HEIGHT)
    foot = int(INNER_CY)
    for x in range(PILLAR_X0 - 1, PILLAR_X1 + 2):
        fill(sp, x, int(BOWL_CY), x, foot + 1, STONE[side_tone(x, PILLAR_X0 - 1, PILLAR_X1 + 2)])
    for x in range(PILLAR_X0 - 2, PILLAR_X1 + 3):  # pé mais largo
        fill(sp, x, foot - 1, x, foot + 1, STONE[side_tone(x, PILLAR_X0 - 2, PILLAR_X1 + 3)])
    sp.outline()
    return sp


def bowl(water: Color | None) -> Sprite:
    """Prato raso no alto da coluna."""
    sp = Sprite(WIDTH, HEIGHT)
    for y in range(HEIGHT):
        for x in range(WIDTH):
            if in_ellipse(x, y, BOWL_CY, BOWL_RX, BOWL_RY):
                sp.put(x, y, STONE[2])
            elif in_ellipse(x, y - BOWL_WALL, BOWL_CY, BOWL_RX, BOWL_RY) and y + 0.5 > BOWL_CY:
                sp.put(x, y, STONE[side_tone(x, CX - BOWL_RX, CX + BOWL_RX)])
    sp.outline()
    hollow(sp, BOWL_CY + 0.4, BOWL_INNER_RX, BOWL_INNER_RY, water)
    return sp


def finial() -> Sprite:
    """Bica no meio do prato: haste com uma bola em cima."""
    sp = Sprite(WIDTH, HEIGHT)
    fill(sp, PILLAR_X0 + 1, FINIAL_TOP + 3, PILLAR_X1 - 1, int(BOWL_CY), STONE[1])
    fill(sp, PILLAR_X0, int(BOWL_CY) - 1, PILLAR_X1, int(BOWL_CY), STONE[1])
    fill(sp, PILLAR_X0, FINIAL_TOP + 1, PILLAR_X1, FINIAL_TOP + 3, STONE[1])
    fill(sp, PILLAR_X0 + 1, FINIAL_TOP, PILLAR_X1 - 1, FINIAL_TOP, STONE[1])
    sp.outline()
    sp.put(PILLAR_X0 + 1, FINIAL_TOP + 1, STONE[2])
    sp.put(PILLAR_X0 + 1, FINIAL_TOP + 2, STONE[2])
    return sp


def pillar(water: Color | None) -> list[Sprite]:
    """Coluna, prato e bica, de trás para a frente."""
    return [column(), bowl(water), finial()]


# ---------- água animada ----------

RIPPLE_START, RIPPLE_STEP = 6.0, 2.0  # raio do primeiro anel e quanto ele cresce por quadro
GLINTS = {(7, 27), (8, 27), (9, 28), (26, 28), (27, 28)}  # brilhos fixos na água da bacia


def ripples(sp: Sprite, frame: int) -> None:
    """Anéis que saem do pé da coluna e reflexo claro no fundo da bacia."""
    for y in range(HEIGHT):
        for x in range(WIDTH):
            if sp.px[y][x] != WATER[1]:
                continue
            dx, dy = x + 0.5 - CX, (y + 0.5 - INNER_CY) / 0.38
            d = (dx * dx + dy * dy) ** 0.5
            ring = (d - RIPPLE_START - RIPPLE_STEP * frame) % (RIPPLE_STEP * FRAMES)
            if ring < 1.0:
                sp.put(x, y, WATER[2])
            elif (x, y) in GLINTS:
                sp.put(x, y, WATER[3])
            elif y + 0.5 < INNER_CY - 2.5:
                sp.put(x, y, WATER[0])  # parede de trás reflete escuro


def foam(sp: Sprite, frame: int) -> None:
    """Espuma onde a água do prato cai na bacia, piscando entre os quadros."""
    for x in (PILLAR_X0 - 3, PILLAR_X1 + 3, PILLAR_X0 - 4, PILLAR_X1 + 4):
        y = int(INNER_CY) + (x + frame) % 2
        sp.put(x, y, WATER[3])


def streams(sp: Sprite, frame: int) -> None:
    """Fios d'água transbordando do prato até a bacia, com gotas descendo."""
    y0, y1 = int(BOWL_CY) + 2, int(INNER_CY)
    for x in (int(CX - BOWL_RX) + 1, int(CX + BOWL_RX) - 2):
        for y in range(y0, y1 + 1):
            light = (y - frame) % 4 == 0
            sp.put(x, y, WATER[2] if light else WATER[1])
            sp.put(x + 1, y, WATER[3] if light else WATER[2] if x < CX else WATER[1])


SPRAY = (  # gotas do jato por quadro: (x relativo ao eixo, y)
    ((-3, 3), (3, 1), (-5, 6), (5, 4)),
    ((-4, 2), (4, 3), (-6, 5), (6, 7)),
    ((-3, 1), (3, 4), (-5, 4), (6, 6)),
    ((-4, 3), (4, 2), (-6, 7), (5, 5)),
)


def jet(sp: Sprite, frame: int) -> None:
    """Jato saindo da bica, com o topo pulsando e gotas espirrando para os lados."""
    top = 1 + frame % 2
    for y in range(top, FINIAL_TOP + 1):
        sp.put(int(CX) - 1, y, WATER[2])
        sp.put(int(CX), y, WATER[3] if (y + frame) % 3 else WATER[2])
    sp.put(int(CX) - 2, top + 1, WATER[1])
    sp.put(int(CX) + 1, top + 1, WATER[1])
    for dx, y in SPRAY[frame]:
        sp.put(int(CX) + dx, y, WATER[2] if dx < 0 else WATER[3])
        sp.put(int(CX) + dx, y + 1, WATER[1])


# ---------- quadros ----------

def fountain_still() -> Image.Image:
    """Chafariz seco: bacia e prato vazios."""
    return stack(basin(None), *pillar(None))


def fountain_on(frame: int) -> Image.Image:
    """Chafariz funcionando: bacia cheia, prato transbordando e jato no topo."""
    pool = basin(WATER[1])
    ripples(pool, frame)
    water = Sprite(WIDTH, HEIGHT)
    streams(water, frame)
    foam(water, frame)
    jet(water, frame)
    return stack(pool, *pillar(WATER[1]), water)


# ---------- ícone ----------

ICON_PALETTE: dict[str, Color] = {
    "1": WOOD[0], "2": WOOD[1], "3": WOOD[2],
    "i": STONE[0], "I": STONE[1],  # aros de ferro
    "w": WATER[1], "W": WATER[2], "F": WATER[3],
}
BUCKET = (  # balde de madeira cheio d'água, 10x10
    "..........",
    ".33222211.",
    "3WFWWWWWw1",
    "3WwwwwwwW1",
    "2IIIIIIIi1",
    ".33222211.",
    ".32222211.",
    ".IIIIIIii.",
    "..322211..",
    "..IIIIii..",
)


def draw_icon(rows: tuple[str, ...]) -> Image.Image:
    """Mapa ASCII com 1 px de contorno por fora (mesmo traço de items.draw)."""
    sp = Sprite(len(rows[0]) + 2, len(rows) + 2)
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != ".":
                sp.put(x + 1, y + 1, ICON_PALETTE[ch])
    shape = [(x, y) for y in range(sp.h) for x in range(sp.w) if not sp.filled(x, y) and any(
        sp.filled(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
    for x, y in shape:
        sp.put(x, y, OUTLINE)
    return sp.image()


def fountain_frames() -> tuple[dict[str, Image.Image], dict[str, list[str]]]:
    """Chafariz seco, os 4 quadros do chafariz ligado e o ícone da água."""
    names = [f"fountain_on_{f}" for f in range(FRAMES)]
    frames = {"fountain": fountain_still()}
    frames.update({name: fountain_on(f) for f, name in enumerate(names)})
    frames["item_water"] = centered(draw_icon(BUCKET))
    return frames, {"fountain_on": names}


def preview(path: str, scale: int = 4) -> None:
    """Folha de conferência: todos os quadros lado a lado sobre grama."""
    frames, _ = fountain_frames()
    pad = 4
    sheet = Image.new("RGBA", (sum(f.width + pad for f in frames.values()) + pad, HEIGHT + 2 * pad),
                      (70, 120, 60, 255))
    x = pad
    for img in frames.values():
        sheet.alpha_composite(img, (x, pad + HEIGHT - img.height))
        x += img.width + pad
    sheet.resize((sheet.width * scale, sheet.height * scale), Image.NEAREST).save(path)


if __name__ == "__main__":
    preview("/tmp/claude-0/fountain_preview.png")
