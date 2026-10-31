"""Captação de água (water_intake, 4x4), desenhada por nós: nora de caçambas na margem do rio.

A roda fica em pé dentro de um poço de pedra ligado ao rio, à esquerda. As caçambas sobem cheias pelo lado
direito, viram no alto dentro de uma calha de madeira, e a calha leva a água até o cocho de pedra à direita.
Mesma montagem do cart_yard: 68 px de largura, chão 4x4 embaixo e o que fica de pé crescendo para cima.
"""

from __future__ import annotations

import math

from PIL import Image

from machines import FRAMES, IRON, OUTLINE, WOOD, Color, Sprite
from road_art import STONE
from roads import WATER
from transport import TILE, fill, over, ringed

WATER_LIGHT = (0x8C, 0xC8, 0xF0)
WATER_DARK = (0x35, 0x6C, 0xA4)
INTAKE_W, INTAKE_H = 4 * TILE + 4, 4 * TILE + 10

# Roda: centro, raio do aro e número de caçambas (a roda anda uma caçamba a cada ciclo de 4 quadros).
WHEEL_C = (22.0, 34.0)
WHEEL_R = 18.0
WHEEL_SPOKES = 8
WHEEL_BUCKETS = 10
BUCKET_STEP = math.tau / WHEEL_BUCKETS

# Poço do rio (esquerda), calha no alto e cocho (direita).
POOL = (2, 44, 42, 73)           # x0, y0, x1, y1 do poço com borda de pedra
POOL_SURFACE = 52                # linha da água no poço: o que está abaixo dela fica submerso
FLUME_Y = 18                     # topo da calha
FLUME_X = (30, 62)
SPOUT_X = 58
TROUGH = (46, 58, 66, 73)


def stone(x: int, y: int) -> Color:
    """Pedra em blocos 4x3 desencontrados, com junta escura."""
    row = y // 3
    joint = y % 3 == 2 or (x + 2 * (row % 2)) % 5 == 4
    return STONE[0] if joint else STONE[2] if (x + y) % 7 == 0 else STONE[1]


def water(x: int, y: int, frame: int) -> Color:
    """Água com ondinhas claras que correm para a direita a cada quadro."""
    if (x - 2 * frame + 3 * (y // 3)) % 9 == 0 and y % 3 == 0:
        return WATER_LIGHT
    return WATER_DARK if y % 6 == 5 else WATER


# ---------- chão ----------

def pool_back(frame: int) -> Image.Image:
    """Poço: borda de pedra no fundo e nos lados e a água que entra do rio pela esquerda."""
    sp = Sprite(INTAKE_W, INTAKE_H)
    x0, y0, x1, y1 = POOL
    for y in range(y0, y1 - 5):
        for x in range(x0, x1 + 1):
            rim = y < y0 + 3 or x > x1 - 2
            sp.put(x, y, stone(x, y) if rim else water(x, y, frame))
    return sp.image()


def pool_front(frame: int) -> Image.Image:
    """Faixa da água à frente da roda (esconde o pé dela) e o muro de pedra da frente do poço."""
    sp = Sprite(INTAKE_W, INTAKE_H)
    x0, _, x1, y1 = POOL
    for y in range(POOL_SURFACE, y1 - 5):
        for x in range(x0, x1 - 1):
            sp.put(x, y, WATER_LIGHT if y == POOL_SURFACE and (x + frame) % 4 == 0 else water(x, y, frame))
    for y in range(y1 - 5, y1 + 1):
        for x in range(x0, x1 + 1):
            sp.put(x, y, STONE[2] if y == y1 - 5 else stone(x, y))
    sp.outline()
    return sp.image()


def trough(frame: int) -> Image.Image:
    """Cocho de pedra que recebe a água da calha."""
    sp = Sprite(INTAKE_W, INTAKE_H)
    x0, y0, x1, y1 = TROUGH
    fill(sp, x0, y0, x1, y1, STONE[1])
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            sp.put(x, y, STONE[2] if y == y0 else stone(x, y))
    for y in range(y0 + 2, y0 + 8):              # boca do cocho, cheia
        for x in range(x0 + 2, x1 - 1):
            sp.put(x, y, water(x, y, frame))
    sp.outline()
    return sp.image()


# ---------- roda ----------

def wheel_supports() -> Image.Image:
    """Cavalete em A atrás da roda, com os pés na borda do poço."""
    sp = Sprite(INTAKE_W, INTAKE_H)
    cx, cy = WHEEL_C
    foot = POOL[1] + 2
    for y in range(int(cy), foot + 1):
        t = (y - cy) / (foot - cy)
        for lean, tone in ((-1, WOOD[2]), (1, WOOD[1])):
            x = round(cx + lean * (3 + 14 * t))
            fill(sp, x, y, x + 1, y, tone)
    return ringed(sp)


def wheel(frame: int) -> Image.Image:
    """Roda de madeira em pé: aro duplo, raios que giram e cubo de ferro."""
    sp = Sprite(INTAKE_W, INTAKE_H)
    cx, cy = WHEEL_C
    phase = -frame * BUCKET_STEP / FRAMES        # anti-horário na tela: sobe pela direita
    sector = math.tau / WHEEL_SPOKES
    for y in range(INTAKE_H):
        for x in range(INTAKE_W):
            dx, dy = x - cx, y - cy
            d = math.hypot(dx, dy)
            if d > WHEEL_R:
                continue
            spoke = (math.atan2(dy, dx) - phase) % sector
            if d < 2.2:
                color = IRON[2] if dx + dy < 0 else IRON[1]
            elif d < 3.4:
                color = IRON[0]
            elif d > WHEEL_R - 3:
                color = WOOD[2] if dx + dy < -4 else WOOD[1] if dx + dy < 8 else WOOD[0]
                if WHEEL_R - 2 < d < WHEEL_R - 1:
                    color = WOOD[0]
            else:
                continue
            sp.put(x, y, color)
    sp.outline()
    for y in range(INTAKE_H):                     # raios depois do contorno, para não virarem linha preta
        for x in range(INTAKE_W):
            dx, dy = x - cx, y - cy
            d = math.hypot(dx, dy)
            spoke = (math.atan2(dy, dx) - phase) % sector
            if 3.4 <= d <= WHEEL_R - 3 and min(spoke, sector - spoke) * d < 0.9:
                sp.put(x, y, WOOD[2] if dx + dy < 0 else WOOD[1])
    return sp.image()


def bucket_spots(frame: int) -> list[tuple[int, int, bool]]:
    """Posição de cada caçamba no aro e se vai cheia (lado que sobe, à direita, abaixo da calha)."""
    cx, cy = WHEEL_C
    phase = -frame * BUCKET_STEP / FRAMES
    spots = []
    for k in range(WHEEL_BUCKETS):
        ang = phase + k * BUCKET_STEP
        x, y = cx + (WHEEL_R + 1) * math.cos(ang), cy + (WHEEL_R + 1) * math.sin(ang)
        spots.append((round(x), round(y), math.cos(ang) > 0.15 and y > FLUME_Y + 2))
    return spots


def buckets(frame: int) -> Image.Image:
    """Caçambas de madeira com cinta de ferro, sempre de boca para cima; as que sobem levam água."""
    sp = Sprite(INTAKE_W, INTAKE_H)
    for x, y, full in bucket_spots(frame):
        fill(sp, x - 2, y - 1, x + 2, y + 2, WOOD[1])
        fill(sp, x - 2, y, x + 2, y, IRON[1])
        fill(sp, x - 1, y - 1, x + 1, y - 1, WATER if full else WOOD[0])
        if full:
            sp.put(x, y - 1, WATER_LIGHT)
    sp.outline()
    return sp.image()


# ---------- calha e água ----------

def flume() -> Image.Image:
    """Calha de tábuas no alto, apoiada em dois postes, que leva a água até a bica sobre o cocho."""
    sp = Sprite(INTAKE_W, INTAKE_H)
    x0, x1 = FLUME_X
    for px in (44, 60):                           # postes até o chão
        fill(sp, px, FLUME_Y + 5, px + 2, TROUGH[1] - 2, WOOD[1])
        fill(sp, px, FLUME_Y + 5, px, TROUGH[1] - 2, WOOD[2])
    fill(sp, x0, FLUME_Y, x1, FLUME_Y + 1, WOOD[2])  # borda de cima
    fill(sp, x0, FLUME_Y + 2, x1, FLUME_Y + 3, WATER)  # água correndo dentro
    fill(sp, x0, FLUME_Y + 4, x1, FLUME_Y + 6, WOOD[1])  # tábua da frente
    fill(sp, x0, FLUME_Y + 6, x1, FLUME_Y + 6, WOOD[0])
    for x in range(x0 + 5, x1, 8):                # cintas de ferro
        fill(sp, x, FLUME_Y + 4, x, FLUME_Y + 6, IRON[1])
    sp.outline()
    return sp.image()


def flowing_water(frame: int) -> Image.Image:
    """Brilho correndo na calha, jorro da bica até o cocho e respingos que caem das caçambas cheias."""
    img = Image.new("RGBA", (INTAKE_W, INTAKE_H))
    px = img.load()
    x0, x1 = FLUME_X
    for x in range(x0 + 1, x1):                   # brilho andando na calha
        if (x - 2 * frame) % 6 == 0:
            px[x, FLUME_Y + 2] = (*WATER_LIGHT, 255)
    for y in range(FLUME_Y + 4, TROUGH[1] + 3):   # jorro com faixas claras descendo
        light = (y - 3 * frame) % 6 < 2
        px[SPOUT_X, y] = (*OUTLINE, 255)
        px[SPOUT_X + 1, y] = (*(WATER_LIGHT if light else WATER), 255)
        px[SPOUT_X + 2, y] = (*WATER, 255)
        px[SPOUT_X + 3, y] = (*OUTLINE, 255)
    for x, y, full in bucket_spots(frame):        # pingos sob as caçambas que sobem
        if full:
            drop = y + 4 + (frame + x) % 3 * 2
            if drop < POOL_SURFACE:
                px[x, drop] = (*WATER_LIGHT, 255)
    return img


def splash(frame: int) -> Image.Image:
    """Respingo onde o jorro bate no cocho e onde a calha recebe as caçambas."""
    sp = Sprite(INTAKE_W, INTAKE_H)
    sx, sy = SPOUT_X + 1, TROUGH[1] + 2
    for dx, dy in ((-2, -1), (3, -1), (-3, -2), (4, -2)) if frame % 2 else ((-1, -2), (2, -2), (-2, -3), (3, -3)):
        sp.put(sx + dx, sy + dy, WATER_LIGHT)
    for dx, dy in ((0, -1), (2, -2), (-1, -2)) if frame % 2 else ((1, -1), (-1, -1), (3, -2)):
        sp.put(FLUME_X[0] + 3 + dx, FLUME_Y + dy, WATER_LIGHT)
    return sp.image()


def water_intake(frame: int) -> Image.Image:
    """Um quadro da captação, montado de trás para a frente."""
    img = pool_back(frame)
    for layer in (wheel_supports(), wheel(frame), buckets(frame), pool_front(frame), trough(frame),
                  flume(), flowing_water(frame), splash(frame)):
        img = over(img, layer)
    return img


def water_intake_frames() -> tuple[dict[str, Image.Image], dict[str, list[str]]]:
    names = [f"water_intake_{f}" for f in range(FRAMES)]
    return {name: water_intake(f) for f, name in enumerate(names)}, {"water_intake": names}


if __name__ == "__main__":
    frames, _ = water_intake_frames()
    scale, pad = 4, 8
    sheet = Image.new("RGBA", ((INTAKE_W + pad) * FRAMES * scale, (INTAKE_H + 2 * pad) * scale), (70, 120, 60, 255))
    for f, img in enumerate(frames.values()):
        sheet.alpha_composite(img.resize((INTAKE_W * scale, INTAKE_H * scale), Image.NEAREST),
                              ((pad // 2 + f * (INTAKE_W + pad)) * scale, pad * scale))
    sheet.save("/tmp/claude-0/water_intake_preview.png")
