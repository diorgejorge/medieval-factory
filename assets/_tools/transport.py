"""Transporte desenhado por nós: calha (chute), esteira de roletes (belt), guincho (hoist), divisor (splitter)
e filtro (filter).

Rotação no contrato do core (sentido horário a partir do sul): r0 = fluxo para o sul, r1 oeste, r2 norte,
r3 leste. Calha e esteira (retas, curvas, T e cruz) vêm de conveyor.py; aqui ficam as peças montadas sobre a
calha.
"""

from __future__ import annotations

import math

from PIL import Image, ImageOps

from conveyor import conveyor_sequences
from machines import FIRE, FRAMES, IRON, OUTLINE, WOOD, Color, Sprite

TILE = 16


def fill(sp: Sprite, x0: int, y0: int, x1: int, y1: int, color: Color) -> None:
    """Retângulo inclusivo [x0..x1] x [y0..y1]."""
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            sp.put(x, y, color)


def directions(south: list[Image.Image], east: list[Image.Image], name: str,
               north: list[Image.Image] | None = None) -> dict[str, list[Image.Image]]:
    """Gera as 4 rotações a partir do desenho com fluxo para o sul (r0) e para o leste (r3).

    Peças com algo de pé (poste, torre) passam `north` desenhado à parte, porque virar o sul de ponta-cabeça
    deixaria o que está de pé pendurado para baixo.
    """
    return {
        name: south,
        f"{name}_r1": [ImageOps.mirror(f) for f in east],
        f"{name}_r2": north if north is not None else [ImageOps.flip(f) for f in south],
        f"{name}_r3": east,
    }


def over(base: Image.Image, top: Image.Image) -> Image.Image:
    """Cópia de `base` com `top` por cima (mesmo tamanho)."""
    out = base.copy()
    out.alpha_composite(top)
    return out


def ringed(sp: Sprite) -> Image.Image:
    """Contorno por fora da silhueta, para peças finas (mastro, poste) que o contorno por dentro apagaria."""
    out = Sprite(sp.w, sp.h)
    for y in range(sp.h):
        for x in range(sp.w):
            if sp.filled(x, y):
                out.put(x, y, sp.px[y][x])
            elif any(sp.filled(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                out.put(x, y, OUTLINE)
    return out.image()


def raised(base: Image.Image, height: int) -> Image.Image:
    """Põe o tile num quadro mais alto, colado embaixo, para caber algo de pé acima dele."""
    out = Image.new("RGBA", (TILE, height))
    out.alpha_composite(base, (0, height - TILE))
    return out


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


# ---------- guincho ----------
# Nora de madeira com caçambas de ferro sobre um trecho de calha; sobe a carga contra o declive.
# O quadro tem 24 px de altura, colado embaixo: os 16 de baixo são a calha, os 8 de cima a torre.

HOIST_H = 24
BUCKETS = 6


def hoist_east(frame: int) -> Image.Image:
    """Roda vista de frente: cavalete em A atrás, caçambas girando na borda, parede da calha na frente."""
    lift = HOIST_H - TILE
    base = raised(chute_east(), HOIST_H)
    cx, cy = 7.5, 9.5
    legs = Sprite(TILE, HOIST_H)                    # cavalete em A, fino: contorno por fora
    foot = lift + 11
    for y in range(int(cy), foot + 1):
        t = (y - cy) / (foot - cy)
        legs.put(round(cx - 0.5 - 5 * t), y, WOOD[2])
        legs.put(round(cx + 0.5 + 5 * t), y, WOOD[1])
    img = over(base, ringed(legs))
    sp = Sprite(TILE, HOIST_H)
    phase = frame * (math.tau / BUCKETS) / FRAMES
    for y in range(HOIST_H):                        # roda cheia: aro, miolo escuro, raios girando, cubo
        for x in range(TILE):
            dx, dy = x - cx, y - cy
            d = math.hypot(dx, dy)
            if d > 6.2:
                continue
            spoke = (math.atan2(dy, dx) - phase) % (math.tau / 4)
            if d < 1.2:
                color = IRON[2]
            elif d > 4.4:
                color = WOOD[2] if dx + dy < -1 else WOOD[1]
            elif min(spoke, math.tau / 4 - spoke) * d < 0.8:
                color = WOOD[2]
            else:
                color = WOOD[0]
            sp.put(x, y, color)
    sp.outline()
    for k in range(BUCKETS):                        # caçambas de ferro cravadas no aro
        ang = phase + k * math.tau / BUCKETS
        sp.put(round(cx + 5.2 * math.cos(ang)), round(cy + 5.2 * math.sin(ang)), IRON[2])
    img.alpha_composite(sp.image())
    front = base.crop((0, lift + 10, TILE, lift + 14))  # parede da frente da calha cobre o pé da roda
    img.alpha_composite(front, (0, lift + 10))
    return img


def hoist_tower(frame: int) -> Image.Image:
    """Roda vista de lado (fluxo norte-sul): dois postes nas paredes e a fila de caçambas descendo na roda."""
    sp = Sprite(TILE, HOIST_H)
    for x0, light, dark in ((2, WOOD[2], WOOD[1]), (12, WOOD[1], WOOD[0])):  # postes sobre as paredes
        fill(sp, x0, 3, x0, 15, light)
        fill(sp, x0 + 1, 3, x0 + 1, 15, dark)
        sp.put(x0 + (1 if x0 == 2 else 0), 7, IRON[1])  # ponta do eixo
    fill(sp, 6, 1, 6, 16, WOOD[2])                  # roda de perfil
    fill(sp, 7, 1, 8, 16, WOOD[1])
    fill(sp, 9, 1, 9, 16, WOOD[0])
    for y in range(1, 17):                          # caçambas descendo na face de cá da roda
        if (y - 1 - frame) % FRAMES == 0:
            fill(sp, 6, y, 9, y, IRON[1])
            sp.put(6, y, IRON[2])
    return ringed(sp)


def hoist_south(frame: int) -> Image.Image:
    return over(raised(chute_south(), HOIST_H), hoist_tower(frame))


def hoist_north(frame: int) -> Image.Image:
    return over(raised(ImageOps.flip(chute_south()), HOIST_H), hoist_tower(FRAMES - 1 - frame))


# ---------- divisor ----------
# Junção em T: a carga entra por trás, bate na tábua em cunha e sai pelos dois lados; a frente é fechada.

def splitter_south() -> Image.Image:
    sp = Sprite(TILE, TILE)
    fill(sp, 2, 0, 13, 13, OUTLINE)
    fill(sp, 0, 4, 15, 13, OUTLINE)
    fill(sp, 3, 0, 3, 4, WOOD[2])       # paredes da entrada
    fill(sp, 12, 0, 12, 4, WOOD[1])
    fill(sp, 0, 5, 15, 5, WOOD[2])      # borda de trás das saídas laterais
    fill(sp, 4, 0, 11, 9, WOOD[0])      # canal de entrada
    fill(sp, 0, 6, 15, 9, WOOD[0])      # canal das saídas
    fill(sp, 0, 10, 15, 10, WOOD[2])    # parede da frente
    fill(sp, 0, 11, 15, 12, WOOD[1])
    for dy, half in ((3, 0), (4, 0), (5, 1), (6, 1), (7, 2), (8, 2), (9, 3)):  # tábua em cunha
        fill(sp, 7 - half, dy, 8 + half, dy, WOOD[2] if dy < 9 else WOOD[1])
        sp.put(7 - half - 1, dy, OUTLINE)
        sp.put(8 + half + 1, dy, OUTLINE)
    for x0, step in ((2, -1), (13, 1)):  # setas para os lados
        for dx, dy in ((0, 6), (1, 7), (1, 8), (0, 9)):
            sp.put(x0 + step * dx, dy, WOOD[1])
    return sp.image()


def splitter_east() -> Image.Image:
    sp = Sprite(TILE, TILE)
    fill(sp, 0, 3, 13, 13, OUTLINE)
    fill(sp, 6, 0, 13, 15, OUTLINE)
    fill(sp, 0, 4, 6, 4, WOOD[2])       # borda de trás da entrada
    fill(sp, 0, 5, 11, 9, WOOD[0])      # canal de entrada
    fill(sp, 0, 10, 6, 10, WOOD[2])     # parede da frente da entrada
    fill(sp, 0, 11, 6, 12, WOOD[1])
    fill(sp, 7, 0, 7, 15, WOOD[2])      # parede de trás das saídas
    fill(sp, 8, 0, 11, 15, WOOD[0])     # canal das saídas (norte e sul)
    fill(sp, 12, 0, 12, 15, WOOD[1])    # parede da frente, fechada
    for dx, half in ((3, 0), (4, 0), (5, 1), (6, 1), (7, 1), (8, 2), (9, 2), (10, 2)):  # tábua em cunha
        fill(sp, dx, 7 - half, dx, 7 + half, WOOD[2] if dx < 10 else WOOD[1])
        sp.put(dx, 7 - half - 1, OUTLINE)
        sp.put(dx, 7 + half + 1, OUTLINE)
    for y0, step in ((1, -1), (14, 1)):  # setas para os lados
        for dx, dy in ((8, 0), (9, 1), (10, 0)):
            sp.put(dx, y0 + step * dy, WOOD[1])
    return sp.image()


# ---------- filtro ----------
# Calha com uma grade de ferro atravessada no canal e uma bandeirola ao lado marcando o item que passa.

def grate(x0: int, y0: int, x1: int, y1: int, vertical_bars: bool) -> Image.Image:
    """Grade de ferro no retângulo: fundo escuro e barras claras alternadas."""
    sp = Sprite(TILE, TILE)
    fill(sp, x0, y0, x1, y1, IRON[0])
    if vertical_bars:
        for x in range(x0 + 1, x1, 2):
            fill(sp, x, y0, x, y1, IRON[2])
    else:
        for y in range(y0 + 1, y1, 2):
            fill(sp, x0, y, x1, y, IRON[2])
    return sp.image()


def flag(pole_x: int, foot_y: int, cloth_dx: int) -> Image.Image:
    """Bandeirola de pé: mastro de madeira com pano vermelho virado para `cloth_dx` (+1 ou -1)."""
    sp = Sprite(TILE, TILE)
    fill(sp, pole_x, foot_y - 6, pole_x, foot_y, WOOD[2])
    for dy in (0, 1):
        for i in (1, 2):
            sp.put(pole_x + cloth_dx * i, foot_y - 6 + dy, FIRE[2] if dy == 0 else FIRE[0])
    return ringed(sp)


def filter_body_south() -> Image.Image:
    return over(chute_south(), grate(4, 6, 11, 9, vertical_bars=True))


def filter_south() -> Image.Image:
    return over(filter_body_south(), flag(14, 9, -1))


def filter_north() -> Image.Image:
    return over(ImageOps.flip(filter_body_south()), flag(14, 9, -1))


def filter_east() -> Image.Image:
    body = over(chute_east(), grate(6, 5, 9, 9, vertical_bars=False))
    return over(body, flag(13, 12, -1))


def transport_frames() -> tuple[dict[str, Image.Image], dict[str, list[str]]]:
    sequences: dict[str, list[Image.Image]] = conveyor_sequences()
    sequences.update(directions([hoist_south(f) for f in range(FRAMES)],
                                [hoist_east(f) for f in range(FRAMES)], "hoist",
                                north=[hoist_north(f) for f in range(FRAMES)]))
    sequences.update(directions([splitter_south()], [splitter_east()], "splitter"))
    sequences.update(directions([filter_south()], [filter_east()], "filter", north=[filter_north()]))
    frames: dict[str, Image.Image] = {}
    animations: dict[str, list[str]] = {}
    for name, images in sequences.items():
        if len(images) == 1:
            frames[name] = images[0]
            continue
        animations[name] = [f"{name}_{i}" for i in range(len(images))]
        frames.update(zip(animations[name], images))
    return frames, animations
