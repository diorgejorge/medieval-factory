"""Arte provisória das próximas frentes (FRENTES.md 16 e 19): moinho de vento, poço, celeiro e caixa de engrenagem.

Vista 3/4, luz do noroeste, sem chão nem sombra. Cada peça é feita de camadas (Sprites com o próprio contorno)
empilhadas de trás para a frente; a última linha opaca é a base do footprint (âncora do objeto).
"""

from __future__ import annotations

import math

from PIL import Image

from fountain import HOLLOW, MORTAR, STONE
from machines import FRAMES, IRON, OUTLINE, WOOD, Color, Sprite, gear
from roads import STRAW
from transport import TILE, fill

ROOF = ((0x6E, 0x2A, 0x2E), (0xA4, 0x40, 0x3A), (0xD0, 0x68, 0x48))  # telha: escuro, médio, claro
CLOTH = ((0xA8, 0x98, 0x80), (0xD8, 0xCC, 0xB0), (0xF6, 0xEE, 0xDA))  # lona das pás
SACK = ((0x7A, 0x5C, 0x38), (0xB0, 0x8C, 0x58), (0xDC, 0xC0, 0x88))  # estopa dos sacos
DARK = (0x2A, 0x1E, 0x1A)  # vão de porta e janela
WATER_DEEP = (0x2E, 0x5E, 0x98)


def width(tiles: int) -> int:
    """Largura do quadro: footprint em tiles + 4 px de folga."""
    return tiles * TILE + 4


def stack(w: int, h: int, *layers: Sprite) -> Image.Image:
    """Empilha as camadas, a primeira atrás."""
    img = Image.new("RGBA", (w, h))
    for layer in layers:
        img.alpha_composite(layer.image())
    return img


def tone_across(x: float, x0: float, x1: float) -> int:
    """Tom pela posição horizontal num corpo redondo: claro à esquerda, escuro à direita."""
    t = (x + 0.5 - x0) / max(x1 - x0, 1)
    return 2 if t < 0.3 else 1 if t < 0.75 else 0


def in_ellipse(x: int, y: int, cx: float, cy: float, rx: float, ry: float) -> bool:
    return ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1


def masonry(x: int, y: int, y0: int, course: int = 4, run: int = 7) -> bool:
    """Rejunte de pedra em fiadas desencontradas a partir da linha y0."""
    row = (y - y0) // course
    return (y - y0) % course == course - 1 or (x + 3 * row) % run == 0


# ---------- moinho de vento (4x4) ----------

MILL_W, MILL_H = width(4), 108
MILL_CX = MILL_W / 2
TOWER_TOP, TOWER_BOTTOM = 40, MILL_H - 3  # base reta; a curva da elipse desce até a última linha
TOWER_HALF_TOP, TOWER_HALF_BOTTOM = 12.0, 17.0
CONE_TOP, CONE_BASE, CONE_HALF = 12, 42, 16.0
HUB_X, HUB_Y = int(MILL_CX), 40
SAIL_LEN, SAIL_START, SAIL_WIDTH = 31, 7, 7


def tower_half(y: float) -> float:
    """Meia largura da torre, que afina para cima."""
    t = (y - TOWER_TOP) / (TOWER_BOTTOM - TOWER_TOP)
    return TOWER_HALF_TOP + t * (TOWER_HALF_BOTTOM - TOWER_HALF_TOP)


def tower() -> Sprite:
    """Torre redonda de pedra com porta em arco embaixo e uma janelinha no meio."""
    sp = Sprite(MILL_W, MILL_H)
    for y in range(TOWER_TOP, MILL_H):
        half = tower_half(min(y, TOWER_BOTTOM))
        for x in range(MILL_W):
            dx = x + 0.5 - MILL_CX
            if abs(dx) > half:
                continue
            if y > TOWER_BOTTOM and not in_ellipse(x, y, MILL_CX, TOWER_BOTTOM, half, 3):
                continue  # base arredondada
            arc = int(2 * math.sqrt(max(half * half - dx * dx, 0)) / half)  # fiadas curvam com o cilindro
            color = MORTAR if masonry(x, y - arc, TOWER_TOP) else STONE[tone_across(x, MILL_CX - half, MILL_CX + half)]
            sp.put(x, y, color)
    door(sp, int(MILL_CX), MILL_H - 3, 5, 15)
    window(sp, int(MILL_CX), 70)
    sp.outline()
    return sp


def door(sp: Sprite, cx: int, bottom: int, half: int, height: int) -> None:
    """Porta de tábuas com topo em arco e moldura escura."""
    top = bottom - height
    for y in range(top, bottom + 1):
        for x in range(cx - half, cx + half):
            dx, dy = x + 0.5 - cx, y - (top + half)
            if dy < 0 and dx * dx + dy * dy > half * half:
                continue
            edge = abs(dx) > half - 1 or (dy < 0 and dx * dx + dy * dy > (half - 1) ** 2)
            plank = (x - cx) % 3 == 0
            sp.put(x, y, OUTLINE if edge else WOOD[0] if plank else WOOD[1])
    sp.put(cx + half - 3, top + height // 2 + 1, IRON[2])  # argola


def window(sp: Sprite, cx: int, y: int) -> None:
    """Janelinha escura com peitoril de madeira."""
    fill(sp, cx - 3, y - 4, cx + 2, y + 1, OUTLINE)
    fill(sp, cx - 2, y - 3, cx + 1, y, DARK)
    fill(sp, cx - 4, y + 2, cx + 3, y + 2, WOOD[2])


def cone_roof() -> Sprite:
    """Telhado cônico de telhas, com a barra de baixo em elipse e um pináculo no topo."""
    sp = Sprite(MILL_W, MILL_H)
    for y in range(CONE_TOP, CONE_BASE + 4):
        for x in range(MILL_W):
            t = (y + 0.5 - CONE_TOP) / (CONE_BASE - CONE_TOP)
            in_cone = y <= CONE_BASE and abs(x + 0.5 - MILL_CX) <= t * CONE_HALF
            if not (in_cone or in_ellipse(x, y, MILL_CX, CONE_BASE, CONE_HALF, 3.5)):
                continue
            row = (y - CONE_TOP) % 4 == 3
            tone = tone_across(x, MILL_CX - CONE_HALF, MILL_CX + CONE_HALF)
            sp.put(x, y, ROOF[max(tone - 1, 0)] if row else ROOF[tone])
    fill(sp, HUB_X - 1, CONE_TOP - 5, HUB_X, CONE_TOP, WOOD[1])  # pináculo
    fill(sp, HUB_X - 2, CONE_TOP - 7, HUB_X + 1, CONE_TOP - 5, IRON[1])
    sp.outline()
    return sp


def sails(angle: float) -> Sprite:
    """As 4 pás: vara de madeira e lona com ripas, todas viradas `angle` radianos."""
    sp = Sprite(MILL_W, MILL_H)
    for arm in range(4):
        a = angle + arm * math.tau / 4
        ux, uy = math.cos(a), math.sin(a)
        for y in range(MILL_H):
            for x in range(MILL_W):
                dx, dy = x + 0.5 - HUB_X, y + 0.5 - HUB_Y
                u, v = dx * ux + dy * uy, -dx * uy + dy * ux  # ao longo da vara e para o lado
                if not 0 <= u <= SAIL_LEN:
                    continue
                if abs(v) <= 1.0:
                    sp.put(x, y, WOOD[1] if v < 0 else WOOD[0])
                elif SAIL_START <= u and 1.0 < v <= SAIL_WIDTH:
                    lath = int(u) % 5 == 0 or v > SAIL_WIDTH - 1
                    sp.put(x, y, WOOD[2] if lath else CLOTH[2] if v < 3 else CLOTH[1])
    sp.outline()
    for y in range(HUB_Y - 3, HUB_Y + 4):  # cubo de ferro por cima das varas
        for x in range(HUB_X - 3, HUB_X + 4):
            d = math.hypot(x + 0.5 - HUB_X - 0.5, y + 0.5 - HUB_Y - 0.5)
            if d <= 3.2:
                sp.put(x, y, OUTLINE if d > 2.2 else IRON[2] if x + y < HUB_X + HUB_Y else IRON[1])
    return sp


def windmill(frame: int) -> Image.Image:
    """Um quadro do moinho; as pás andam 1/16 de volta por quadro (4 quadros = 1/4 de volta, simétrico)."""
    angle = math.pi / 4 + frame * (math.tau / 4) / FRAMES
    return stack(MILL_W, MILL_H, tower(), cone_roof(), sails(angle))


# ---------- poço (2x2) ----------

WELL_W, WELL_H = width(2), 46
WELL_CX = WELL_W / 2
RING_CY, RING_RX, RING_RY, RING_WALL = 33.0, 14.5, 5.5, 8
RING_INNER_RX, RING_INNER_RY = 11.5, 3.6
POST_LEFT, POST_RIGHT, POST_W = 3, 29, 4  # x de cada poste e largura
POST_TOP = 11
WINCH_Y = 17
BUCKET_TOP = 24


def ring() -> Sprite:
    """Mureta redonda de pedra com a boca escura do poço."""
    sp = Sprite(WELL_W, WELL_H)
    for y in range(WELL_H):
        for x in range(WELL_W):
            top = in_ellipse(x, y, WELL_CX, RING_CY, RING_RX, RING_RY)
            body = in_ellipse(x, y - RING_WALL, WELL_CX, RING_CY, RING_RX, RING_RY) or (
                RING_CY <= y + 0.5 <= RING_CY + RING_WALL and abs(x + 0.5 - WELL_CX) <= RING_RX)
            if top:
                sp.put(x, y, STONE[2] if y + 0.5 < RING_CY or x + 0.5 < WELL_CX + 5 else STONE[1])
            elif body:
                joint = masonry(x, y, int(RING_CY))
                sp.put(x, y, MORTAR if joint else STONE[tone_across(x, WELL_CX - RING_RX, WELL_CX + RING_RX)])
    sp.outline()
    for y in range(WELL_H):  # boca: parede interna e água funda lá embaixo
        for x in range(WELL_W):
            if in_ellipse(x, y, WELL_CX, RING_CY + 0.5, RING_INNER_RX, RING_INNER_RY):
                deep = in_ellipse(x, y, WELL_CX, RING_CY + 1.5, RING_INNER_RX - 3, RING_INNER_RY - 1.5)
                sp.put(x, y, WATER_DEEP if deep else HOLLOW[1] if y + 0.5 < RING_CY else HOLLOW[0])
    return sp


def well_frame() -> Sprite:
    """Postes, sarilho com manivela e telhadinho de duas águas."""
    sp = Sprite(WELL_W, WELL_H)
    for x0 in (POST_LEFT, POST_RIGHT):
        fill(sp, x0, POST_TOP, x0 + POST_W - 1, int(RING_CY) + 1, WOOD[1])
        fill(sp, x0 + 1, POST_TOP, x0 + 1, int(RING_CY) + 1, WOOD[2])
    winch_x0, winch_x1 = POST_LEFT + POST_W, POST_RIGHT - 1
    fill(sp, winch_x0, WINCH_Y - 1, winch_x1, WINCH_Y + 2, WOOD[1])  # sarilho
    fill(sp, winch_x0, WINCH_Y, winch_x1, WINCH_Y, WOOD[2])
    for x in range(winch_x0 + 3, winch_x1 - 2):  # voltas de corda no meio do sarilho
        sp.put(x, WINCH_Y + 1, STRAW[1] if x % 2 else STRAW[0])
    crank_x = POST_RIGHT + POST_W
    fill(sp, crank_x, WINCH_Y, crank_x + 1, WINCH_Y + 1, IRON[1])  # manivela
    fill(sp, crank_x + 1, WINCH_Y, crank_x + 2, WINCH_Y + 6, IRON[1])
    roof(sp)
    sp.outline()
    return sp


def roof(sp: Sprite) -> None:
    """Água da frente do telhado: trapézio de telhas, mais largo embaixo, cumeeira em cima."""
    top, bottom = 2, POST_TOP + 1
    for y in range(top, bottom + 1):
        grow = (y - top) * 3 // 4
        for x in range(9 - grow, WELL_W - 9 + grow):
            row = (y - top) % 3 == 2
            tone = tone_across(x, 1, WELL_W - 1)
            sp.put(x, y, ROOF[max(tone - 1, 0)] if row else ROOF[tone])
    fill(sp, 9, top, WELL_W - 10, top, WOOD[1])  # cumeeira


def rope() -> Sprite:
    """Corda descendo do sarilho até a alça; fina demais para ganhar contorno."""
    sp = Sprite(WELL_W, WELL_H)
    fill(sp, int(WELL_CX), WINCH_Y + 2, int(WELL_CX), BUCKET_TOP - 2, STRAW[1])
    return sp


def bucket() -> Sprite:
    """Balde de madeira com aros de ferro, pendurado sobre a boca do poço."""
    sp = Sprite(WELL_W, WELL_H)
    cx = int(WELL_CX)
    fill(sp, cx - 3, BUCKET_TOP, cx + 3, BUCKET_TOP + 6, WOOD[1])
    fill(sp, cx - 3, BUCKET_TOP, cx - 2, BUCKET_TOP + 6, WOOD[2])
    fill(sp, cx - 3, BUCKET_TOP + 1, cx + 3, BUCKET_TOP + 1, IRON[1])
    fill(sp, cx - 3, BUCKET_TOP + 5, cx + 3, BUCKET_TOP + 5, IRON[1])
    fill(sp, cx - 2, BUCKET_TOP - 2, cx + 2, BUCKET_TOP - 2, IRON[0])  # alça
    sp.put(cx - 3, BUCKET_TOP - 1, IRON[0])
    sp.put(cx + 3, BUCKET_TOP - 1, IRON[0])
    sp.outline()
    return sp


def well() -> Image.Image:
    return stack(WELL_W, WELL_H, ring(), well_frame(), rope(), bucket())


# ---------- celeiro (4x4) ----------

GRAN_W, GRAN_H = width(4), 86
WALL_X0, WALL_X1 = 8, GRAN_W - 9
WALL_TOP, FLOOR_Y = 34, 66  # paredes de tábua e viga do piso
STILT_TOP, STILT_BOTTOM = FLOOR_Y + 3, GRAN_H - 1
STILTS = (10, 22, 45, 57)  # centro de cada pé de pedra
GRAN_DOOR_X0, GRAN_DOOR_X1 = 26, 41
THATCH_TOP = 6
THATCH_LAYER = 7  # linhas por camada de palha


def granary_body() -> Sprite:
    """Paredes de tábuas em pé com moldura de vigas, porta dupla e a viga do piso."""
    sp = Sprite(GRAN_W, GRAN_H)
    for x in range(WALL_X0, WALL_X1 + 1):
        plank = WOOD[0] if (x - WALL_X0) % 4 == 0 else WOOD[2] if (x - WALL_X0) % 4 == 1 else WOOD[1]
        fill(sp, x, WALL_TOP, x, FLOOR_Y, plank)
    for x0 in (WALL_X0, WALL_X1 - 2):  # esteios dos cantos
        fill(sp, x0, WALL_TOP, x0 + 2, FLOOR_Y, WOOD[0])
    fill(sp, WALL_X0, FLOOR_Y, WALL_X1, FLOOR_Y + 2, WOOD[0])  # viga do piso
    fill(sp, WALL_X0, FLOOR_Y, WALL_X1, FLOOR_Y, WOOD[1])
    granary_door(sp)
    fill(sp, 13, 44, 18, 48, OUTLINE)  # respiros para o grão
    fill(sp, 49, 44, 54, 48, OUTLINE)
    for x in (14, 16, 50, 52):
        fill(sp, x, 45, x, 47, WOOD[0])
    sp.outline()
    return sp


def granary_door(sp: Sprite) -> None:
    """Porta dupla com travessas em X."""
    x0, x1, y0, y1 = GRAN_DOOR_X0, GRAN_DOOR_X1, 42, FLOOR_Y - 1
    fill(sp, x0, y0, x1, y1, OUTLINE)
    mid = (x0 + x1) // 2
    for left, right in ((x0 + 1, mid - 1), (mid + 1, x1 - 1)):
        fill(sp, left, y0 + 1, right, y1, WOOD[1])
        span = right - left
        for y in range(y0 + 1, y1 + 1):
            t = (y - y0 - 1) / (y1 - y0 - 1)
            sp.put(left + round(t * span), y, WOOD[2])
            sp.put(right - round(t * span), y, WOOD[2])
    sp.put(mid - 2, (y0 + y1) // 2, IRON[2])
    sp.put(mid + 2, (y0 + y1) // 2, IRON[2])


def straw(x: int, depth: int) -> Color:
    """Palha em camadas de THATCH_LAYER linhas: fios verticais, borda de baixo de cada camada mais escura."""
    layer, row = divmod(depth, THATCH_LAYER)
    strand = (x * 5 + layer * 3) % 6
    if depth == 0 or row == THATCH_LAYER - 1 or (row == THATCH_LAYER - 2 and strand % 2):
        return STRAW[0]
    return STRAW[2] if strand == 0 and row < THATCH_LAYER - 3 else STRAW[1]


def thatch() -> Sprite:
    """Telhado de palha grosso, mais largo que as paredes, com franja irregular embaixo."""
    sp = Sprite(GRAN_W, GRAN_H)
    eave = WALL_TOP + 3
    for y in range(THATCH_TOP, eave + 2):
        grow = (y - THATCH_TOP) // 3
        for x in range(14 - grow, GRAN_W - 14 + grow):
            if y > eave and (x * 7) % 5 < 2:
                continue  # franja
            sp.put(x, y, straw(x, y - THATCH_TOP))
    fill(sp, 30, 18, 37, 25, WOOD[0])  # janelinha do sótão
    fill(sp, 31, 19, 36, 25, DARK)
    sp.outline()
    return sp


def stilts() -> Sprite:
    """Pés de pedra em cogumelo (chapéu largo em cima) que erguem o celeiro."""
    sp = Sprite(GRAN_W, GRAN_H)
    for cx in STILTS:
        fill(sp, cx - 4, STILT_TOP, cx + 3, STILT_TOP + 2, STONE[2])
        fill(sp, cx - 4, STILT_TOP + 2, cx + 3, STILT_TOP + 2, STONE[1])
        for y in range(STILT_TOP + 3, STILT_BOTTOM + 1):
            half = 1 + (y - STILT_TOP) // 6
            for x in range(cx - half - 1, cx + half + 1):
                sp.put(x, y, STONE[tone_across(x, cx - half - 1, cx + half + 1)])
    sp.outline()
    return sp


def steps() -> Sprite:
    """Escadinha de tábuas da porta até o chão."""
    sp = Sprite(GRAN_W, GRAN_H)
    for i, y in enumerate(range(FLOOR_Y + 3, STILT_BOTTOM, 5)):
        fill(sp, GRAN_DOOR_X0 + 1 - i, y, GRAN_DOOR_X1 - 1 + i, y + 1, WOOD[2])
        fill(sp, GRAN_DOOR_X0 + 1 - i, y + 2, GRAN_DOOR_X1 - 1 + i, y + 2, WOOD[0])
    for x in (GRAN_DOOR_X0 - 2, GRAN_DOOR_X1 + 1):  # banzos
        fill(sp, x, FLOOR_Y + 3, x + 1, STILT_BOTTOM, WOOD[1])
    sp.outline()
    return sp


def sack(sp: Sprite, x0: int, bottom: int, w: int, h: int) -> None:
    """Saco de estopa amarrado: corpo gordo de cantos redondos, cordão e a boca franzida em leque."""
    top = bottom - h + 1
    for y in range(top, bottom + 1):
        inset = 2 if y in (top, bottom) else 1 if y in (top + 1, bottom - 1) else 0
        for x in range(x0 + inset, x0 + w - inset):
            sp.put(x, y, SACK[tone_across(x, x0, x0 + w)])
    neck = x0 + w // 2
    fill(sp, neck - 1, top - 1, neck + 1, top - 1, SACK[0])  # cordão
    fill(sp, neck - 2, top - 3, neck + 2, top - 2, SACK[2])  # boca franzida
    sp.put(neck, top - 3, SACK[1])


def sacks() -> list[Sprite]:
    """Sacos de grão empilhados ao pé da escada, cada um com o próprio contorno."""
    layers = []
    for x0, bottom, w, h in ((44, STILT_BOTTOM, 11, 9), (53, STILT_BOTTOM, 11, 8), (48, STILT_BOTTOM - 8, 10, 7),
                             (12, STILT_BOTTOM, 11, 8)):
        sp = Sprite(GRAN_W, GRAN_H)
        sack(sp, x0, bottom, w, h)
        sp.outline()
        layers.append(sp)
    layers.sort(key=lambda layer: max(y for y in range(GRAN_H) if any(layer.px[y])))  # de trás para a frente
    return layers


def granary() -> Image.Image:
    return stack(GRAN_W, GRAN_H, stilts(), granary_body(), thatch(), steps(), *sacks())


# ---------- caixa de engrenagem (1x1) ----------

BOX_W, BOX_H = width(1), 26
BOX_X0, BOX_X1 = 1, BOX_W - 2
BOX_LID, BOX_FRONT = 2, 8  # topo da tampa e começo da face da frente
GEAR_SIZE, GEAR_TEETH = 16, 8  # igual à gear_small
PLATE_R = 7.5  # raio da chapa atrás da engrenagem


def box() -> Sprite:
    """Caixote de tábuas: tampa clara vista de cima, frente com cantoneiras e chapa de ferro sob a engrenagem."""
    sp = Sprite(BOX_W, BOX_H)
    fill(sp, BOX_X0 + 1, BOX_LID, BOX_X1 - 1, BOX_FRONT - 1, WOOD[2])
    for y in range(BOX_LID + 2, BOX_FRONT, 2):
        fill(sp, BOX_X0 + 1, y, BOX_X1 - 1, y, WOOD[1])
    fill(sp, BOX_X0, BOX_FRONT, BOX_X1, BOX_H - 1, WOOD[0])
    for y in range(BOX_FRONT + 4, BOX_H - 1, 5):
        fill(sp, BOX_X0, y, BOX_X1, y, WOOD[1])  # junta entre as tábuas
    for x, y in ((BOX_X0 + 1, BOX_FRONT + 1), (BOX_X1 - 2, BOX_FRONT + 1),
                 (BOX_X0 + 1, BOX_H - 3), (BOX_X1 - 2, BOX_H - 3)):
        fill(sp, x, y, x + 1, y + 1, IRON[1])  # cantoneiras
    sp.outline()
    cx, cy = BOX_W / 2, BOX_FRONT + (BOX_H - BOX_FRONT) / 2
    for y in range(BOX_H):  # chapa de ferro redonda atrás da engrenagem
        for x in range(BOX_W):
            if in_ellipse(x, y, cx, cy, PLATE_R, PLATE_R):
                sp.put(x, y, IRON[0] if in_ellipse(x, y, cx, cy, PLATE_R - 1, PLATE_R - 1) else OUTLINE)
    return sp


def gear_box(gear_frames: list[Image.Image], frame: int) -> Image.Image:
    """Um quadro da caixa com a engrenagem girando presa na frente."""
    img = stack(BOX_W, BOX_H, box())
    g = gear_frames[frame]
    img.alpha_composite(g, ((BOX_W - GEAR_SIZE) // 2, BOX_FRONT + (BOX_H - BOX_FRONT - GEAR_SIZE) // 2))
    return img


# ---------- quadros ----------

def next_front_frames() -> tuple[dict[str, Image.Image], dict[str, list[str]]]:
    """Moinho (4 quadros), poço, celeiro e caixa de engrenagem (4 quadros)."""
    gears = gear(GEAR_SIZE, GEAR_TEETH)
    animated = {
        "windmill": [windmill(f) for f in range(FRAMES)],
        "gearbox": [gear_box(gears, f) for f in range(FRAMES)],
    }
    frames: dict[str, Image.Image] = {"well": well(), "granary": granary()}
    animations: dict[str, list[str]] = {}
    for name, images in animated.items():
        animations[name] = [f"{name}_{i}" for i in range(len(images))]
        frames.update(zip(animations[name], images))
    return frames, animations


def preview(path: str, scale: int = 4) -> None:
    """Folha de conferência: todos os quadros lado a lado sobre grama, alinhados pela base."""
    frames, _ = next_front_frames()
    pad = 4
    tallest = max(f.height for f in frames.values())
    sheet = Image.new("RGBA", (sum(f.width + pad for f in frames.values()) + pad, tallest + 2 * pad),
                      (70, 120, 60, 255))
    x = pad
    for img in frames.values():
        sheet.alpha_composite(img, (x, pad + tallest - img.height))
        x += img.width + pad
    sheet.resize((sheet.width * scale, sheet.height * scale), Image.NEAREST).save(path)


if __name__ == "__main__":
    preview("/tmp/claude-0/next_fronts_preview.png")
