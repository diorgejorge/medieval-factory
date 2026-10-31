"""Transporte desenhado por nós: calha (chute), esteira de roletes (belt), guincho (hoist), divisor (splitter)
e filtro (filter).

Rotação no contrato do core (sentido horário a partir do sul): r0 = fluxo para o sul, r1 oeste, r2 norte,
r3 leste. Calha e esteira atravessam o tile de borda a borda no sentido do fluxo para emendar com a vizinha.
"""

from __future__ import annotations

import math
from collections.abc import Callable

from PIL import Image, ImageOps

from machines import FIRE, FRAMES, IRON, OUTLINE, WOOD, Color, Sprite

TILE = 16
LEATHER = ((0x3A, 0x26, 0x22), (0x5A, 0x3C, 0x30))


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


# ---------- curvas e começos ----------
# Peças de encaixe da calha e da esteira. A curva `turn_<de><para>` abre só nos lados por onde a carga entra
# e sai, com as mesmas linhas e colunas das peças retas nas bordas abertas; o começo `start_<para>` é a reta
# fechada atrás por uma tábua, para a primeira peça da linha não parecer cortada.

SIDES = {"n": (0, -1), "s": (0, 1), "w": (-1, 0), "e": (1, 0)}
TURNS = [a + b for a in SIDES for b in SIDES
         if a != b and SIDES[a] != tuple(-c for c in SIDES[b])]
LIT, SHADE = WOOD[2], WOOD[1]

# Por par de lados abertos (horizontal + vertical): canal e paredes como retângulos (x0, y0, x1, y1).
# Parede de fora no canto oposto às aberturas, parede de dentro no canto entre elas; luz do noroeste.
CORNER_CHANNEL = {
    "ws": ((0, 5, 11, 9), (4, 10, 11, 15)),
    "es": ((4, 5, 15, 9), (4, 10, 11, 15)),
    "wn": ((0, 5, 11, 9), (4, 0, 11, 4)),
    "en": ((4, 5, 15, 9), (4, 0, 11, 4)),
}
CORNER_WALLS = {
    "ws": ((0, 3, 13, 3, OUTLINE), (13, 3, 13, 15, OUTLINE),         # fora: trás e direita
           (0, 4, 12, 4, LIT), (12, 5, 12, 15, SHADE),
           (0, 10, 3, 10, LIT), (3, 11, 3, 15, LIT),                  # dentro: borda e parede iluminada
           (0, 11, 2, 12, SHADE), (0, 13, 2, 13, OUTLINE), (2, 14, 2, 15, OUTLINE)),
    "es": ((2, 3, 15, 3, OUTLINE), (2, 3, 2, 15, OUTLINE),           # fora: trás e esquerda
           (3, 4, 15, 4, LIT), (3, 5, 3, 15, LIT),
           (12, 10, 15, 10, LIT), (12, 11, 12, 15, SHADE),            # dentro: borda e parede na sombra
           (13, 11, 15, 12, SHADE), (13, 13, 15, 13, OUTLINE), (13, 14, 13, 15, OUTLINE)),
    "wn": ((13, 0, 13, 13, OUTLINE), (0, 13, 13, 13, OUTLINE),       # fora: direita e frente
           (12, 0, 12, 9, SHADE), (0, 10, 12, 10, LIT), (0, 11, 12, 12, SHADE),
           (0, 3, 2, 3, OUTLINE), (2, 0, 2, 2, OUTLINE),              # dentro: canto do fundo
           (0, 4, 3, 4, LIT), (3, 0, 3, 3, LIT)),
    "en": ((2, 0, 2, 13, OUTLINE), (2, 13, 15, 13, OUTLINE),         # fora: esquerda e frente
           (3, 0, 3, 9, LIT), (3, 10, 15, 10, LIT), (3, 11, 15, 12, SHADE),
           (13, 3, 15, 3, OUTLINE), (13, 0, 13, 2, OUTLINE),          # dentro: canto do fundo
           (12, 0, 12, 3, SHADE), (12, 4, 15, 4, LIT)),
}

# Seta do fluxo da calha no braço de saída, com o mesmo desenho das setas das retas.
CHEVRON = {
    "e": ((12, 5), ((0, 0), (1, 1), (2, 2), (1, 3), (0, 4))),
    "w": ((1, 5), ((2, 0), (1, 1), (0, 2), (1, 3), (2, 4))),
    "s": ((5, 11), ((0, 0), (1, 1), (2, 2), (3, 2), (4, 1), (5, 0))),
    "n": ((5, 1), ((0, 2), (1, 1), (2, 0), (3, 0), (4, 1), (5, 2))),
}

# Tábua do fim, pelo lado de trás: em cima da peça a borda e a face de dentro, embaixo a face da frente.
END_BOARD = {
    "n": ((2, 0, 13, 0, OUTLINE), (3, 1, 12, 1, LIT), (4, 2, 11, 2, SHADE)),
    "s": ((2, 15, 13, 15, OUTLINE), (3, 12, 12, 12, LIT), (3, 13, 12, 14, SHADE)),
    "w": ((0, 3, 0, 13, OUTLINE), (1, 4, 1, 10, LIT)),
    "e": ((15, 3, 15, 13, OUTLINE), (14, 4, 14, 10, SHADE)),
}
OPPOSITE = {"n": "s", "s": "n", "w": "e", "e": "w"}


def corner_key(turn: str) -> str:
    """Par de lados abertos da curva, sempre o horizontal primeiro ("ws", "es", "wn", "en")."""
    return "".join(sorted(turn, key=lambda side: side in "ns"))


def corner_step(key: str, x: int, y: int) -> int:
    """Passo 0..15 do pixel ao longo da curva, contado da borda horizontal até a vertical.

    Nos braços é a distância até a borda, como nas retas; no quadrado do canto vem do ângulo em volta da
    quina de dentro, para as ripas girarem na curva sem quebrar a cadência de 4 px das vizinhas.
    """
    h, v = key
    sx, sy = (-1 if h == "w" else 1), (1 if v == "s" else -1)
    if (h == "w" and x < 4) or (h == "e" and x > 11):
        return x if h == "w" else 15 - x
    if (v == "s" and y > 9) or (v == "n" and y < 5):
        return y if v == "s" else 15 - y
    pivot_x, pivot_y = (4 if h == "w" else 12), (10 if v == "s" else 5)
    dx, dy = x + 0.5 - pivot_x, y + 0.5 - pivot_y
    turn = math.atan2(-sx * dx, -sy * dy) / (math.pi / 2)
    end = 10 if v == "s" else 11
    return min(end - 1, 4 + int(max(0.0, turn) * (end - 4)))


def corner(turn: str, channel: Color, slat: Color | None = None, frame: int = 0) -> Image.Image:
    """Curva que entra por `turn[0]` e sai por `turn[1]`; com `slat`, ripas da esteira andando no fluxo."""
    key = corner_key(turn)
    sp = Sprite(TILE, TILE)
    for x0, y0, x1, y1 in CORNER_CHANNEL[key]:
        fill(sp, x0, y0, x1, y1, channel)
        if slat is None:
            continue
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                step = corner_step(key, x, y)
                if turn[0] != key[0]:
                    step = 15 - step
                if (step - frame) % FRAMES == 0:
                    sp.put(x, y, slat)
    for x0, y0, x1, y1, color in CORNER_WALLS[key]:
        fill(sp, x0, y0, x1, y1, color)
    return sp.image()


def chute_turn(turn: str) -> Image.Image:
    sp = Sprite(TILE, TILE)
    (x0, y0), pixels = CHEVRON[turn[1]]
    for dx, dy in pixels:
        sp.put(x0 + dx, y0 + dy, WOOD[1])
    return over(corner(turn, WOOD[0]), sp.image())


def belt_turn(turn: str, frame: int) -> Image.Image:
    return corner(turn, LEATHER[0], LEATHER[1], frame)


def start(straight: Image.Image, flow: str) -> Image.Image:
    """Reta com fluxo para `flow` fechada atrás pela tábua do fim."""
    sp = Sprite(TILE, TILE)
    for x0, y0, x1, y1, color in END_BOARD[OPPOSITE[flow]]:
        fill(sp, x0, y0, x1, y1, color)
    return over(straight, sp.image())


def fittings(name: str, straights: dict[str, list[Image.Image]],
             turn: Callable[[str, int], Image.Image], frames: int) -> dict[str, list[Image.Image]]:
    """Curvas e começos de um material a partir das retas já giradas e do desenho da curva por quadro."""
    by_flow = {"s": name, "w": f"{name}_r1", "n": f"{name}_r2", "e": f"{name}_r3"}
    pieces = {f"{name}_turn_{t}": [turn(t, f) for f in range(frames)] for t in TURNS}
    pieces.update({f"{name}_start_{d}": [start(img, d) for img in straights[by_flow[d]]] for d in by_flow})
    return pieces


def transport_frames() -> tuple[dict[str, Image.Image], dict[str, list[str]]]:
    sequences: dict[str, list[Image.Image]] = {}
    chute = directions([chute_south()], [chute_east()], "chute")
    belt = directions([belt_south(f) for f in range(FRAMES)], [belt_east(f) for f in range(FRAMES)], "belt")
    sequences.update(chute)
    sequences.update(belt)
    sequences.update(fittings("chute", chute, lambda t, _: chute_turn(t), 1))
    sequences.update(fittings("belt", belt, belt_turn, FRAMES))
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
