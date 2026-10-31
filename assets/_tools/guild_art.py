"""Prédios das guildas (mosteiro, mercado, scriptorium, 4x4) e os ícones do manuscrito e do aço.

Arte provisória no traço das máquinas: contorno OUTLINE de 1 px, 3 tons por material, luz do noroeste,
vista 3/4. Cada peça é montada em camadas (Sprites com contorno próprio) empilhadas de trás para a frente.
Sem chão e sem sombra: a última linha opaca é a base do footprint (âncora do objeto).
"""

from __future__ import annotations

from PIL import Image

from items import centered
from machines import FIRE, IRON, OUTLINE, WOOD, Color, Sprite
from transport import TILE, fill

WIDTH = 4 * TILE + 4  # 4 tiles + folga do contorno, como o cart_yard

STONE = ((0x55, 0x5A, 0x6A), (0x8A, 0x8F, 0x9A), (0xC8, 0xCC, 0xD0))  # pedra cinza do chafariz
MORTAR = (0x45, 0x48, 0x56)
SAND = ((0x8A, 0x70, 0x58), (0xC0, 0xA4, 0x80), (0xE2, 0xCC, 0xA4))  # pedra clara do scriptorium
SAND_MORTAR = (0x6E, 0x58, 0x46)
SLATE = ((0x2E, 0x34, 0x4C), (0x4A, 0x52, 0x70), (0x6E, 0x78, 0x98))  # telhado de ardósia
TILE_ROOF = ((0x7A, 0x34, 0x2A), (0xA8, 0x4A, 0x36), (0xD0, 0x6E, 0x4A))  # telhas de barro
GRASS = ((0x3A, 0x6A, 0x34), (0x5A, 0x92, 0x40), (0x8C, 0xC0, 0x58))
ROCK = ((0x4E, 0x46, 0x44), (0x76, 0x6C, 0x66), (0xA4, 0x9A, 0x90))
DIRT = (0x9C, 0x70, 0x48)
GOLD = ((0xB0, 0x7A, 0x2A), (0xE0, 0xB0, 0x48), (0xFF, 0xE1, 0x66))
GLASS = ((0x2E, 0x4E, 0x7A), (0x4A, 0x8E, 0xC8), (0x9C, 0xD4, 0xF0))
DARK = (0x2A, 0x1E, 0x1A)  # vão escuro de porta e janela
CLOTH_WHITE = ((0xC8, 0xC0, 0xB8), (0xF4, 0xF0, 0xE8))
CLOTH = {  # listras dos toldos: (escuro, claro) de cada cor
    "red": ((0xA8, 0x2A, 0x36), (0xE0, 0x39, 0x4C)),
    "blue": ((0x2E, 0x5E, 0x98), (0x4A, 0x8E, 0xC8)),
    "yellow": (GOLD[1], GOLD[2]),
}
CANVAS = ((0xA8, 0x94, 0x70), (0xD4, 0xC0, 0x98), (0xEE, 0xE0, 0xBC))  # sacos de estopa


# ---------- base ----------

class Scene:
    """Camadas do mesmo tamanho, cada uma contornada à parte e empilhada na ordem em que foi criada."""

    def __init__(self, w: int, h: int) -> None:
        self.w, self.h = w, h
        self.layers: list[Sprite] = []

    def layer(self) -> Sprite:
        sp = Sprite(self.w, self.h)
        self.layers.append(sp)
        return sp

    def image(self) -> Image.Image:
        img = Image.new("RGBA", (self.w, self.h))
        for sp in self.layers:
            sp.outline()
            img.alpha_composite(sp.image())
        return img


def speckle(x: int, y: int, salt: int = 0) -> int:
    """Ruído fixo por pixel, para a textura não mudar entre builds."""
    return (x * 73 + y * 151 + salt * 37 + (x * y) % 11) % 23


def in_ellipse(x: int, y: int, cx: float, cy: float, rx: float, ry: float) -> bool:
    return ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1


def lit_tone(x: int, x0: int, x1: int) -> int:
    """Tom pela posição horizontal: luz do noroeste, o lado direito na sombra."""
    t = (x + 0.5 - x0) / (x1 + 1 - x0)
    return 2 if t < 0.2 else 1 if t < 0.8 else 0


def masonry(sp: Sprite, x0: int, y0: int, x1: int, y1: int,
            stone: tuple[Color, Color, Color], mortar: Color, block: int = 6) -> None:
    """Parede de blocos em fiadas de 4 px com rejunte desencontrado; o canto esquerdo pega luz."""
    for y in range(y0, y1 + 1):
        course = (y - y0) // 4
        for x in range(x0, x1 + 1):
            joint = (x - x0 + 3 * (course % 2)) % block == 0
            if (y - y0) % 4 == 3 or joint:
                sp.put(x, y, mortar)
            else:
                tone = lit_tone(x, x0, x1)
                if tone == 1 and speckle(x, y) == 0:
                    tone = 2
                sp.put(x, y, stone[tone])


def shingle(x: int, y: int, y0: int, tones: tuple[Color, Color, Color], row: int = 4) -> Color:
    """Telha em fileiras de `row` px contadas de y0: topo claro, junta escura desencontrada."""
    k = (y - y0) % row
    joint = (x + 3 * ((y - y0) // row % 2)) % 6 == 0
    return tones[0] if k == row - 1 or joint else tones[2] if k == 0 else tones[1]


def arch(sp: Sprite, x0: int, y0: int, x1: int, y1: int, color: Color) -> None:
    """Vão com topo arredondado (meio círculo do tamanho da largura)."""
    r = (x1 - x0 + 1) / 2
    cx = x0 + r
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if y >= y0 + r or in_ellipse(x, y, cx, y0 + r, r, r):
                sp.put(x, y, color)


def frame_arch(sp: Sprite, x0: int, y0: int, x1: int, y1: int, frame: Color, inside: Color) -> None:
    """Vão em arco com moldura de 1 px."""
    arch(sp, x0 - 1, y0 - 1, x1 + 1, y1, frame)
    arch(sp, x0, y0, x1, y1, inside)


def gable_roof(sp: Sprite, cx: int, apex: int, base: int, half: int, depth: int,
               tones: tuple[Color, Color, Color]) -> None:
    """Telhado de duas águas com a empena virada para nós: as águas recuam `depth` px para cima.

    A água esquerda pega luz e a direita fica na sombra; uma beirada escura fecha o triângulo.
    """
    slope = (base - apex) / half
    for x in range(cx - half - 1, cx + half + 2):
        edge = apex + slope * abs(x + 0.5 - cx - 0.5)
        lo = round(edge) + 1
        for y in range(round(edge) - depth, lo + 1):
            row = (y - round(edge) + depth) % 3
            shade = 1 if x > cx else 2
            color = tones[shade - 1] if row == 2 else tones[shade]
            sp.put(x, y, tones[0] if y >= lo else color)


def gable_wall(sp: Sprite, cx: int, apex: int, base: int, half: int, fill_color: Color) -> None:
    """Triângulo da empena logo abaixo da beirada do telhado."""
    slope = (base - apex) / half
    for x in range(cx - half, cx + half + 1):
        top = round(apex + slope * abs(x + 0.5 - cx - 0.5)) + 2
        for y in range(top, base + 1):
            sp.put(x, y, fill_color)


# ---------- mosteiro ----------

MONASTERY_H = 100
MOUND_TOP_CY, MOUND_TOP_RX, MOUND_TOP_RY = 66.0, 30.5, 12.0  # platô de grama
MOUND_BASE_CY, MOUND_BASE_RX, MOUND_BASE_RY = 85.0, 33.5, 14.5  # pé do morro, mais largo
CHAPEL_CX, CHAPEL_APEX, CHAPEL_EAVE, CHAPEL_HALF, CHAPEL_FOOT = 25, 34, 50, 13, 73
TOWER_X0, TOWER_X1, TOWER_TOP, TOWER_FOOT = 41, 53, 24, 71
ROCKS = ((6, 84), (20, 90), (44, 91), (56, 83), (33, 85))  # pedras salientes na encosta
TUFTS = ((13, 82), (39, 95), (51, 88), (27, 89), (60, 92))


def on_mound(x: int, y: int) -> tuple[bool, bool]:
    """(platô, encosta): a encosta liga o platô ao pé do morro, abrindo para baixo."""
    cx = WIDTH / 2
    top = in_ellipse(x, y, cx, MOUND_TOP_CY, MOUND_TOP_RX, MOUND_TOP_RY)
    if top:
        return True, False
    t = min(max((y + 0.5 - MOUND_TOP_CY) / (MOUND_BASE_CY - MOUND_TOP_CY), 0.0), 1.0)
    rx = MOUND_TOP_RX + (MOUND_BASE_RX - MOUND_TOP_RX) * t ** 0.6
    slope = in_ellipse(x, y, cx, MOUND_BASE_CY, MOUND_BASE_RX, MOUND_BASE_RY) or (
        MOUND_TOP_CY <= y + 0.5 <= MOUND_BASE_CY and abs(x + 0.5 - cx) <= rx)
    return False, slope


def mound(sc: Scene) -> None:
    """Morro: platô de grama e encosta que desce em grama e rocha, com pedras e tufos."""
    sp = sc.layer()
    cx = WIDTH / 2
    for y in range(sc.h):
        for x in range(sc.w):
            top, slope = on_mound(x, y)
            if top:
                n = speckle(x, y, 1)
                sp.put(x, y, GRASS[2] if n == 0 else GRASS[0] if n < 2 else GRASS[1])
            elif slope:
                drop = y - MOUND_TOP_CY - MOUND_TOP_RY * (1 - ((x + 0.5 - cx) / MOUND_TOP_RX) ** 2) ** 0.5 \
                    if abs(x + 0.5 - cx) < MOUND_TOP_RX else 99
                grassy = drop < 3 + speckle(x, 0, 4) % 5  # a grama escorre pela borda em franjas
                sp.put(x, y, (GRASS[0] if drop < 1.5 else GRASS[1]) if grassy else rock(x, y))
    for x, y in ROCKS:
        fill(sp, x, y, x + 4, y + 2, ROCK[1])
        fill(sp, x, y, x + 3, y, ROCK[2])
        fill(sp, x + 1, y + 3, x + 4, y + 3, ROCK[0])
    for x, y in TUFTS:
        fill(sp, x, y, x + 2, y, GRASS[1])
        sp.put(x + 1, y - 1, GRASS[2])
    fill(sp, CHAPEL_CX - 2, CHAPEL_FOOT + 1, CHAPEL_CX + 2, 77, DIRT)  # trilha da porta até a borda


def rock(x: int, y: int) -> Color:
    """Encosta: rocha em camadas, clara à esquerda e escurecendo para baixo e para a direita."""
    tone = 2 if x < 16 else 1 if x < 50 else 0
    if y > 92 or (y + x // 7) % 5 == 0:
        tone = max(tone - 1, 0)
    return ROCK[min(tone + 1, 2)] if speckle(x, y, 3) == 0 else ROCK[tone]


def cloister(sc: Scene) -> None:
    """Muro baixo do claustro dos dois lados da capela; o da esquerda tem arcadas."""
    sp = sc.layer()
    for x0, x1 in ((5, 13), (55, 63)):
        masonry(sp, x0, 64, x1, 72, STONE, MORTAR, block=5)
        fill(sp, x0, 63, x1, 63, STONE[2])
    for x in (7, 10):
        arch(sp, x, 66, x + 1, 71, DARK)


def chapel(sc: Scene) -> None:
    """Capela de pedra com a empena virada para nós, porta em arco, rosácea e duas janelinhas."""
    walls = sc.layer()
    masonry(walls, CHAPEL_CX - CHAPEL_HALF, CHAPEL_EAVE, CHAPEL_CX + CHAPEL_HALF + 1, CHAPEL_FOOT,
            STONE, MORTAR)
    gable_wall(walls, CHAPEL_CX, CHAPEL_APEX, CHAPEL_EAVE, CHAPEL_HALF, STONE[2])
    frame_arch(walls, CHAPEL_CX - 3, 62, CHAPEL_CX + 4, CHAPEL_FOOT, STONE[0], WOOD[1])
    fill(walls, CHAPEL_CX, 63, CHAPEL_CX + 1, CHAPEL_FOOT, WOOD[0])
    walls.put(CHAPEL_CX + 3, 68, IRON[2])
    for x in (CHAPEL_CX - 9, CHAPEL_CX + 8):  # janelas estreitas
        frame_arch(walls, x, 54, x + 1, 59, STONE[0], GLASS[1])
        walls.put(x, 55, GLASS[2])
    rose_window(walls, CHAPEL_CX + 0.5, 44.5)
    roof = sc.layer()
    gable_roof(roof, CHAPEL_CX, CHAPEL_APEX, CHAPEL_EAVE, CHAPEL_HALF + 1, 12, TILE_ROOF)


def rose_window(sp: Sprite, cx: float, cy: float) -> None:
    """Rosácea redonda com vidro azul e cruz de chumbo."""
    for y in range(int(cy) - 4, int(cy) + 5):
        for x in range(int(cx) - 4, int(cx) + 5):
            if in_ellipse(x, y, cx, cy, 4, 4):
                sp.put(x, y, STONE[0])
            if in_ellipse(x, y, cx, cy, 3, 3):
                sp.put(x, y, GLASS[2] if x + y < cx + cy - 1 else GLASS[1])
    fill(sp, int(cx), int(cy) - 3, int(cx), int(cy) + 2, STONE[0])
    fill(sp, int(cx) - 3, int(cy), int(cx) + 2, int(cy), STONE[0])


def bell_tower(sc: Scene) -> None:
    """Torre do sino: corpo de pedra, campanário em arco com o sino, telhado em ponta e a cruz."""
    body = sc.layer()
    masonry(body, TOWER_X0, TOWER_TOP, TOWER_X1, TOWER_FOOT, STONE, MORTAR, block=5)
    mid = (TOWER_X0 + TOWER_X1) // 2
    frame_arch(body, mid - 3, TOWER_TOP + 4, mid + 3, TOWER_TOP + 13, STONE[2], DARK)
    fill(body, mid - 2, TOWER_TOP + 9, mid + 2, TOWER_TOP + 11, GOLD[1])  # sino
    fill(body, mid - 1, TOWER_TOP + 7, mid + 1, TOWER_TOP + 8, GOLD[1])
    fill(body, mid - 1, TOWER_TOP + 7, mid - 1, TOWER_TOP + 10, GOLD[2])
    body.put(mid, TOWER_TOP + 12, GOLD[0])
    fill(body, TOWER_X0, TOWER_TOP + 16, TOWER_X1, TOWER_TOP + 16, STONE[0])  # cornija
    frame_arch(body, mid - 1, 52, mid, 58, STONE[0], DARK)  # seteira
    roof = sc.layer()
    apex, base = TOWER_TOP - 15, TOWER_TOP + 1
    for y in range(apex, base + 1):
        half = (y - apex) * (TOWER_X1 - TOWER_X0 + 4) / 2 / (base - apex)
        for x in range(round(mid - half), round(mid + half) + 1):
            side = SLATE[2] if x < mid else SLATE[1]
            roof.put(x, y, SLATE[0] if (y - apex) % 4 == 3 else side)
    cross = sc.layer()
    fill(cross, mid, apex - 8, mid, apex, GOLD[1])
    fill(cross, mid - 2, apex - 6, mid + 2, apex - 6, GOLD[1])
    cross.put(mid, apex - 8, GOLD[2])


def monastery() -> Image.Image:
    sc = Scene(WIDTH, MONASTERY_H)
    mound(sc)
    cloister(sc)
    chapel(sc)
    bell_tower(sc)
    return sc.image()


# ---------- mercado ----------

MARKET_H = 76
STALL_COUNTER, STALL_POSTS, STALL_AWNING = 11, 12, 7  # alturas: balcão, vão das estacas, toldo


def stall(sc: Scene, x0: int, base: int, width: int, cloth: str, goods: list[Color]) -> None:
    """Barraca de madeira: balcão de tábuas, mercadoria no tampo, estacas e toldo listrado."""
    x1 = x0 + width - 1
    top = base - STALL_COUNTER
    counter = sc.layer()
    fill(counter, x0, top + 3, x1, base, WOOD[1])
    for x in range(x0 + 3, x1, 4):
        fill(counter, x, top + 3, x, base, WOOD[0])
    fill(counter, x0, top, x1, top + 2, WOOD[2])
    fill(counter, x0, top + 3, x1, top + 3, WOOD[0])
    produce(sc.layer(), x0 + 3, x1 - 3, top + 1, goods)
    posts = sc.layer()
    awning_low = top - STALL_POSTS
    for x in (x0 + 1, x1 - 2):
        fill(posts, x, awning_low, x + 1, base, WOOD[0])
        fill(posts, x, awning_low, x, base, WOOD[1])
    awning(sc.layer(), x0, x1, awning_low, cloth)


def produce(sp: Sprite, x0: int, x1: int, base: int, goods: list[Color]) -> None:
    """Montinhos de mercadoria em fila sobre o tampo, alternando as cores dadas."""
    x, i = x0, 0
    while x + 3 <= x1:
        color = goods[i % len(goods)]
        fill(sp, x, base - 2, x + 3, base, color)
        fill(sp, x + 1, base - 3, x + 2, base - 3, color)
        sp.put(x + 1, base - 2, lighter(color))
        x, i = x + 5, i + 1


def lighter(c: Color) -> Color:
    return tuple(min(255, v + 60) for v in c)  # type: ignore[return-value]


def awning(sp: Sprite, x0: int, x1: int, low: int, cloth: str) -> None:
    """Toldo inclinado com listras verticais; a franja de baixo é recortada em ondas."""
    dark, light = CLOTH[cloth]
    top = low - STALL_AWNING
    for y in range(top, low + 1):
        grow = (y - top) // 3  # o toldo abre para a frente
        for x in range(x0 - 1 - grow, x1 + 2 + grow):
            stripe = (x - x0) // 4 % 2 == 0
            shade = y >= low - 2
            color = (dark if shade else light) if stripe else CLOTH_WHITE[0 if shade else 1]
            sp.put(x, y, color)
    edge_grow = (low - top) // 3
    for x in range(x0 - 1 - edge_grow, x1 + 2 + edge_grow):
        if (x - x0) % 4 in (1, 2):  # ondas da franja
            stripe = (x - x0) // 4 % 2 == 0
            sp.put(x, low + 1, dark if stripe else CLOTH_WHITE[0])


def crate(sc: Scene, x0: int, base: int, goods: Color) -> None:
    """Caixote de tábuas cheio até a boca."""
    sp = sc.layer()
    fill(sp, x0, base - 6, x0 + 10, base, WOOD[1])
    fill(sp, x0, base - 6, x0 + 10, base - 6, WOOD[2])
    fill(sp, x0, base - 3, x0 + 10, base - 3, WOOD[0])
    fill(sp, x0, base - 6, x0, base, WOOD[0])
    fill(sp, x0 + 10, base - 6, x0 + 10, base, WOOD[0])
    fill(sp, x0 + 1, base - 9, x0 + 9, base - 7, goods)
    for x in range(x0 + 1, x0 + 10, 3):
        sp.put(x, base - 9, lighter(goods))
    fill(sp, x0 + 1, base - 7, x0 + 9, base - 7, WOOD[0])


def sack(sc: Scene, x0: int, base: int) -> None:
    """Saco de estopa amarrado, de barriga larga."""
    sp = sc.layer()
    for y in range(base - 9, base + 1):
        half = 1 if y < base - 7 else 4 if y > base - 6 else 3
        for x in range(x0 + 4 - half, x0 + 5 + half):
            sp.put(x, y, CANVAS[2] if x < x0 + 4 else CANVAS[1])
    fill(sp, x0 + 3, base - 7, x0 + 5, base - 7, WOOD[0])  # amarração
    fill(sp, x0 + 6, base - 4, x0 + 8, base, CANVAS[0])


def barrel(sc: Scene, x0: int, base: int, goods: Color) -> None:
    """Barril aberto com frutas na boca."""
    sp = sc.layer()
    fill(sp, x0, base - 9, x0 + 8, base, WOOD[1])
    fill(sp, x0 + 1, base - 9, x0 + 2, base, WOOD[2])
    fill(sp, x0 + 7, base - 9, x0 + 8, base, WOOD[0])
    for y in (base - 7, base - 2):
        fill(sp, x0, y, x0 + 8, y, IRON[0])
    fill(sp, x0 + 1, base - 11, x0 + 7, base - 10, goods)
    sp.put(x0 + 2, base - 11, lighter(goods))


APPLE, CABBAGE, CARROT = FIRE[0], (0x6C, 0xB0, 0x48), FIRE[1]
BREAD, FISH, PUMPKIN = (0xC6, 0x94, 0x69), (0x75, 0x98, 0x92), (0xE4, 0x8A, 0x2A)


def market() -> Image.Image:
    sc = Scene(WIDTH, MARKET_H)
    stall(sc, 3, 36, 28, "red", [APPLE, CABBAGE])
    stall(sc, 37, 36, 28, "blue", [FISH, BREAD])
    crate(sc, 4, 52, APPLE)
    sack(sc, 18, 50)
    barrel(sc, 6, 68, CABBAGE)
    crate(sc, 16, 74, CARROT)
    sack(sc, 27, 66)
    stall(sc, 36, 75, 28, "yellow", [PUMPKIN, BREAD, CARROT])
    return sc.image()


# ---------- scriptorium ----------

SCRIPT_H = 90
WALL_X0, WALL_X1, WALL_TOP, WALL_FOOT = 4, 63, 54, 89
ROOF_TOP = 22
DORMER_CX, DORMER_APEX, DORMER_HALF = 33, 32, 11
WINDOW_X0, WINDOW_X1, WINDOW_TOP, WINDOW_FOOT = 30, 37, 40, 78


def main_roof(sc: Scene) -> None:
    """Chaminé atrás e o telhado de ardósia visto de cima, abrindo para a beirada."""
    chimney = sc.layer()
    masonry(chimney, 48, ROOF_TOP - 10, 53, ROOF_TOP + 6, STONE, MORTAR, block=3)
    fill(chimney, 47, ROOF_TOP - 11, 54, ROOF_TOP - 10, STONE[0])
    roof = sc.layer()
    for y in range(ROOF_TOP, WALL_TOP + 1):
        grow = (y - ROOF_TOP) // 8  # a beirada abre para a frente
        for x in range(WALL_X0 - 1 - grow, WALL_X1 + 2 + grow):
            roof.put(x, y, shingle(x, y, ROOF_TOP, SLATE))
    fill(roof, WALL_X0 - 5, WALL_TOP, WALL_X1 + 5, WALL_TOP, SLATE[0])


def front_wall(sc: Scene) -> None:
    """Parede de pedra clara com rodapé, porta em arco e uma janelinha."""
    sp = sc.layer()
    masonry(sp, WALL_X0, WALL_TOP + 1, WALL_X1, WALL_FOOT, SAND, SAND_MORTAR)
    fill(sp, WALL_X0, WALL_FOOT - 2, WALL_X1, WALL_FOOT, SAND[0])
    frame_arch(sp, 10, 68, 18, WALL_FOOT, SAND[0], WOOD[1])
    for x in (12, 16):
        fill(sp, x, 70, x, WALL_FOOT, WOOD[0])
    fill(sp, 10, 76, 18, 76, IRON[0])
    sp.put(17, 80, IRON[2])
    frame_arch(sp, 50, 62, 55, 70, SAND[0], GLASS[1])
    fill(sp, 52, 62, 53, 70, SAND[0])
    sp.put(51, 64, GLASS[2])


def dormer(sc: Scene) -> None:
    """Empena da frente com a janela alta em arco, de vitral azul e caixilho de chumbo."""
    wall = sc.layer()
    gable_wall(wall, DORMER_CX, DORMER_APEX, WALL_TOP + 1, DORMER_HALF, SAND[2])
    fill(wall, DORMER_CX - DORMER_HALF, WALL_TOP, DORMER_CX + DORMER_HALF + 1, WALL_TOP + 1, SAND[2])
    roof = sc.layer()
    gable_roof(roof, DORMER_CX, DORMER_APEX, WALL_TOP, DORMER_HALF + 1, 8, TILE_ROOF)
    glass = sc.layer()
    frame_arch(glass, WINDOW_X0, WINDOW_TOP, WINDOW_X1, WINDOW_FOOT, SAND[0], GLASS[1])
    for y in range(WINDOW_TOP, WINDOW_FOOT + 1):
        for x in range(WINDOW_X0, WINDOW_X1 + 1):
            if glass.px[y][x] != GLASS[1]:
                continue
            lead = x == (WINDOW_X0 + WINDOW_X1) // 2 + 1 or (y - WINDOW_TOP) % 6 == 5
            shine = x - WINDOW_X0 + (y - WINDOW_TOP) // 2 in (2, 3)
            glass.put(x, y, SAND[0] if lead else GLASS[2] if shine else GLASS[1])
    fill(glass, WINDOW_X0 - 2, WINDOW_FOOT + 1, WINDOW_X1 + 2, WINDOW_FOOT + 2, SAND[1])  # peitoril


def quill_sign(sc: Scene) -> None:
    """Placa pendurada num braço de ferro: livro aberto com uma pena."""
    bracket = sc.layer()
    fill(bracket, 42, 58, 60, 58, IRON[0])
    fill(bracket, 42, 57, 43, 60, IRON[0])
    for x in (46, 57):
        fill(bracket, x, 59, x, 60, IRON[0])
    board = sc.layer()
    x0, y0, x1, y1 = 43, 61, 60, 73
    fill(board, x0, y0, x1, y1, WOOD[1])
    fill(board, x0, y0, x1, y0, WOOD[2])
    fill(board, x0, y1, x1, y1, WOOD[0])
    book(board, x0 + 7, y1 - 2)
    quill(board, x1 - 2, y0 + 2)


BOOK_PAGE = 5  # colunas de cada página do livro da placa


def book(sp: Sprite, cx: int, base: int) -> None:
    """Livro aberto visto de frente: capa vermelha embaixo, páginas em leque e linhas de texto."""
    fill(sp, cx - BOOK_PAGE - 1, base - 1, cx + BOOK_PAGE + 1, base, CLOTH["red"][0])
    for i in range(BOOK_PAGE):  # as páginas sobem um pouco perto da lombada
        fill(sp, cx - BOOK_PAGE + i, base - 6 - (i > 1), cx - BOOK_PAGE + i, base - 2, CLOTH_WHITE[1])
        fill(sp, cx + 1 + i, base - 6 - (i < 3), cx + 1 + i, base - 2, CLOTH_WHITE[1])
    fill(sp, cx, base - 6, cx, base - 1, CLOTH_WHITE[0])  # lombada
    for y in (base - 5, base - 3):
        fill(sp, cx - BOOK_PAGE + 1, y, cx - 2, y, SAND[0])
        fill(sp, cx + 2, y, cx + BOOK_PAGE - 1, y, SAND[0])


def quill(sp: Sprite, x: int, y: int) -> None:
    """Pena de escrever na diagonal: pluma branca larga em cima, ponta escura embaixo à esquerda."""
    for i in range(7):
        sp.put(x - i, y + i, CLOTH_WHITE[1])
        if i < 5:
            sp.put(x - i + 1, y + i, CLOTH_WHITE[1])
            sp.put(x - i + 1, y + i + 1, CLOTH_WHITE[0])
    sp.put(x - 7, y + 7, OUTLINE)
    sp.put(x - 8, y + 8, OUTLINE)


def scriptorium() -> Image.Image:
    sc = Scene(WIDTH, SCRIPT_H)
    main_roof(sc)
    front_wall(sc)
    dormer(sc)
    quill_sign(sc)
    return sc.image()


# ---------- ícones ----------

ICON_PALETTE: dict[str, Color] = {
    "1": WOOD[0], "2": WOOD[1],
    "m": (0xB0, 0x8C, 0x5C), "p": (0xE0, 0xC8, 0x94), "P": (0xF6, 0xEA, 0xC8),  # pergaminho
    "k": (0x5A, 0x48, 0x40),  # tinta
    "r": (0xA8, 0x2A, 0x36), "R": FIRE[0], "e": (0xFF, 0x8A, 0x8A),  # lacre
    "a": (0x2E, 0x3A, 0x5A), "b": (0x5A, 0x74, 0xA0), "c": (0x9C, 0xB8, 0xD8), "W": (0xF0, 0xF8, 0xFF),  # aço
}
MANUSCRIPT = (  # pergaminho aberto entre dois rolos, com lacre vermelho, 10x10
    "2PPPPPPPP2",
    "1pppppppp1",
    ".PPPPPPPm.",
    ".PkkkkkPm.",
    ".PPPPPPPm.",
    ".PkkkPPPm.",
    ".PPPPrRrm.",
    "2PPPrReRr2",
    "1ppprRRrr1",
    ".....r.r..",
)
STEEL = (  # lingote de aço azulado e polido, mais esguio que o de ferro, 10x10
    "..........",
    "..........",
    "...ccccccb",
    "..cWWcccbb",
    ".ccccccbba",
    "bbbbbbbbaa",
    "bWWbbbbaa.",
    "bbbbbbbba.",
    "aaaaaaaa..",
    "..........",
)


def draw_icon(rows: tuple[str, ...]) -> Image.Image:
    """Mapa ASCII com 1 px de contorno por fora (mesmo traço de items.draw), centrado em 16x16."""
    sp = Sprite(len(rows[0]) + 2, len(rows) + 2)
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != ".":
                sp.put(x + 1, y + 1, ICON_PALETTE[ch])
    edge = [(x, y) for y in range(sp.h) for x in range(sp.w) if not sp.filled(x, y) and any(
        sp.filled(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
    for x, y in edge:
        sp.put(x, y, OUTLINE)
    return centered(sp.image())


# ---------- saída ----------

def guild_frames() -> tuple[dict[str, Image.Image], dict[str, list[str]]]:
    """Todos os quadros das guildas (parados) e os dois ícones; não há animações."""
    frames = {
        "monastery": monastery(),
        "market": market(),
        "scriptorium": scriptorium(),
        "item_manuscript": draw_icon(MANUSCRIPT),
        "item_steel": draw_icon(STEEL),
    }
    return frames, {}


def preview(path: str, scale: int = 4) -> None:
    """Folha de conferência: os quadros lado a lado sobre grama, alinhados pela base."""
    frames, _ = guild_frames()
    pad = 4
    height = max(f.height for f in frames.values())
    sheet = Image.new("RGBA", (sum(f.width + pad for f in frames.values()) + pad, height + 2 * pad),
                      (70, 120, 60, 255))
    x = pad
    for img in frames.values():
        sheet.alpha_composite(img, (x, pad + height - img.height))
        x += img.width + pad
    sheet.resize((sheet.width * scale, sheet.height * scale), Image.NEAREST).save(path)


if __name__ == "__main__":
    preview("/tmp/claude-0/guild_preview.png")
