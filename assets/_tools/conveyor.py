"""Calha (chute) e esteira (belt) montadas por encaixe: toda peça é o canal do meio mais um braço por lado aberto.

Os braços têm o mesmo corte das retas e vão até a borda do tile, então reta, curva, T, cruz e começo emendam
pixel a pixel. As paredes não são desenhadas à mão: saem da distância até o canal (trilho de trás, parede
iluminada à esquerda, parede na sombra à direita e face da frente embaixo, luz do noroeste), e por isso o
canto de uma curva ou de um T fica igual ao das retas.

Frames: `<material>_from_<entradas>_to_<saída>`, entradas na ordem n, e, s, w (`none` = começo da linha).
As retas também saem com os nomes do contrato de rotação (`belt`, `belt_r1`..`belt_r3`).
"""

from __future__ import annotations

from itertools import combinations

from PIL import Image

from machines import FRAMES, IRON, OUTLINE, WOOD, Color

TILE = 16
SIDES = "nesw"
OPPOSITE = {"n": "s", "s": "n", "w": "e", "e": "w"}
LEATHER = ((0x3A, 0x26, 0x22), (0x5A, 0x3C, 0x30))
LIT, SHADE = WOOD[2], WOOD[1]

# Canal: quadrado do meio e braços (x0, y0, x1, y1 inclusivos). Na vista 3/4 o canal deitado é mais baixo.
CENTER = (4, 5, 11, 9)
ARMS = {"n": (4, 0, 11, 4), "s": (4, 10, 11, 15), "w": (0, 5, 3, 9), "e": (12, 5, 15, 9)}
# Alcance das paredes a partir do canal: trilho de trás (1) + contorno; face da frente (3) + contorno; lados (1).
BACK, FRONT, SIDE = 1, 3, 1
ROLLER_EVERY = 8  # cabeças dos roletes da esteira, a cada 8 px nas paredes
ROLLER_AT = 3
# Seta do fluxo da calha no braço de saída.
CHEVRON = {
    "e": ((12, 5), ((0, 0), (1, 1), (2, 2), (1, 3), (0, 4))),
    "w": ((1, 5), ((2, 0), (1, 1), (0, 2), (1, 3), (2, 4))),
    "s": ((5, 11), ((0, 0), (1, 1), (2, 2), (3, 2), (4, 1), (5, 0))),
    "n": ((5, 1), ((0, 2), (1, 1), (2, 0), (3, 0), (4, 1), (5, 2))),
}

Mask = list[list[bool]]


def channel_mask(open_sides: str) -> Mask:
    mask = [[False] * TILE for _ in range(TILE)]
    for x0, y0, x1, y1 in [CENTER, *(ARMS[s] for s in open_sides)]:
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                mask[y][x] = True
    return mask


def reach(mask: Mask, x: int, y: int, dx: int, dy: int, limit: int) -> int | None:
    """Menor k em 1..limit com canal em (x + k*dx, y + k*dy), ou None."""
    for k in range(1, limit + 1):
        cx, cy = x + k * dx, y + k * dy
        if 0 <= cx < TILE and 0 <= cy < TILE and mask[cy][cx]:
            return k
    return None


def front(k: int | None) -> str | None:
    """Abaixo do canal: trilho, face da frente e contorno, conforme a distância."""
    if k is None:
        return None
    return "front_rail" if k == 1 else "front_face" if k <= FRONT else "outline"


def wall(mask: Mask, x: int, y: int) -> str | None:
    """Tipo de parede do pixel fora do canal, ou None se ele fica fora da peça.

    Ordem: trilho e face da frente (cobrem o resto na vista 3/4), paredes dos lados, trilho de trás, contornos
    retos e, por fim, as quinas (canal só na diagonal), que seguem a frente ou viram contorno.
    """
    below = reach(mask, x, y, 0, -1, FRONT + 1)  # canal acima do pixel: o pixel está na frente dele
    if below is not None and below <= FRONT:
        return front(below)
    if reach(mask, x, y, 1, 0, SIDE) is not None:
        return "left_wall"
    if reach(mask, x, y, -1, 0, SIDE) is not None:
        return "right_wall"
    if reach(mask, x, y, 0, 1, BACK) is not None:
        return "back_rail"
    if below is not None or any(reach(mask, x, y, dx, dy, k) for dx, dy, k in
                                ((1, 0, SIDE + 1), (-1, 0, SIDE + 1), (0, 1, BACK + 1))):
        return "outline"
    for dx in (1, -1):  # quinas da frente: canal na diagonal de cima
        diagonal = next((k for k in range(1, FRONT + 2) if channel_at(mask, x + dx, y - k)), None)
        if diagonal is not None:
            return front(diagonal)
    if channel_at(mask, x + 1, y + 1) or channel_at(mask, x - 1, y + 1):
        return "back_rail"  # quina de trás
    near = [(dx, dy) for dx in (-2, -1, 1, 2) for dy in range(-FRONT - 1, BACK + 2) if channel_at(mask, x + dx, y + dy)]
    return "outline" if near else None


def channel_at(mask: Mask, x: int, y: int) -> bool:
    return 0 <= x < TILE and 0 <= y < TILE and mask[y][x]


WALL_COLOR = {"outline": OUTLINE, "front_rail": LIT, "front_face": SHADE, "back_rail": LIT,
              "left_wall": LIT, "right_wall": SHADE}


def flow_step(inputs: str, out: str, x: int, y: int) -> int:
    """Posição do pixel ao longo do fluxo (0 na borda de entrada, 15 na de saída), para as ripas andarem juntas."""
    along = {"w": x, "e": TILE - 1 - x, "n": y, "s": TILE - 1 - y}  # distância até cada borda
    entry = OPPOSITE[out] if not inputs or OPPOSITE[out] in inputs else inputs[0]
    from_entry = along[entry]
    to_exit = TILE - 1 - along[out]
    return (from_entry + to_exit) // 2 if entry != OPPOSITE[out] else from_entry


def piece(inputs: str, out: str, channel: Color, frame: int = 0, slats: Color | None = None,
          rollers: bool = False) -> Image.Image:
    mask = channel_mask(inputs + out)
    img = Image.new("RGBA", (TILE, TILE))
    px = img.load()
    for y in range(TILE):
        for x in range(TILE):
            if mask[y][x]:
                moving = slats is not None and (flow_step(inputs, out, x, y) - frame) % FRAMES == 0
                px[x, y] = (*(slats if moving else channel), 255)
                continue
            kind = wall(mask, x, y)
            if kind is None:
                continue
            color = WALL_COLOR[kind]
            if rollers and roller(mask, kind, x, y):
                color = IRON[2] if kind == "left_wall" or channel_at(mask, x, y - 2) else IRON[0]
            px[x, y] = (*color, 255)
    return img


def roller(mask: Mask, kind: str, x: int, y: int) -> bool:
    """Cabeça de rolete: na face da frente a cada 8 px e nas paredes dos lados na mesma cadência."""
    if kind == "front_face":
        return x % ROLLER_EVERY == ROLLER_AT
    return kind in ("left_wall", "right_wall") and y % ROLLER_EVERY == ROLLER_AT


def with_chevron(img: Image.Image, out: str) -> Image.Image:
    (x0, y0), pixels = CHEVRON[out]
    for dx, dy in pixels:
        img.putpixel((x0 + dx, y0 + dy), (*WOOD[1], 255))
    return img


def chute(inputs: str, out: str) -> list[Image.Image]:
    return [with_chevron(piece(inputs, out, WOOD[0]), out)]


def belt(inputs: str, out: str) -> list[Image.Image]:
    return [piece(inputs, out, LEATHER[0], f, LEATHER[1], rollers=True) for f in range(FRAMES)]


def input_sets(out: str) -> list[str]:
    others = [s for s in SIDES if s != out]
    return ["".join(c) for size in range(len(others) + 1) for c in combinations(others, size)]


ROTATION_NAME = {"s": "", "w": "_r1", "n": "_r2", "e": "_r3"}  # contrato do core: r0 = fluxo para o sul


def conveyor_sequences() -> dict[str, list[Image.Image]]:
    """Todas as peças de calha e esteira, mais as retas com os nomes de rotação do contrato."""
    sequences: dict[str, list[Image.Image]] = {}
    for material, draw in (("chute", chute), ("belt", belt)):
        for out in SIDES:
            for inputs in input_sets(out):
                sequences[f"{material}_from_{inputs or 'none'}_to_{out}"] = draw(inputs, out)
            sequences[f"{material}{ROTATION_NAME[out]}"] = draw(OPPOSITE[out], out)
    return sequences


def straight(material: str, out: str) -> Image.Image:
    """Reta parada (primeiro quadro), para as peças que montam em cima de um trecho de calha."""
    return (chute if material == "chute" else belt)(OPPOSITE[out], out)[0]
