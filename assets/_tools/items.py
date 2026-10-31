"""Ícones dos itens (item_<id>, 16x16) para o HUD e para os itens que andam em calhas e esteiras.

Ordem de preferência: arte própria em vendor/djorge/items/<id>.png, depois ícone do pacote Ninja Adventure
(PACK, com troca de cores quando o item é uma variação), e por fim um desenho nosso bem simples: mapa de 10x10
caracteres (uma letra por cor da PALETTE, '.' vazio) com contorno de 1 px por fora, centrado em 16x16.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

from machines import FIRE, OUTLINE, WOOD

SIZE = 10  # desenho sem o contorno
ICON = 16
VENDOR = Path(__file__).resolve().parent.parent / "vendor"
OWN_ITEMS = VENDOR / "djorge" / "items"
PACK_ITEMS = VENDOR / "ninja-adventure" / "items"

Rgb = tuple[int, int, int]
STONE_HEAD: dict[Rgb, Rgb] = {  # lâmina de ferro do pacote -> pedra lascada
    (95, 113, 96): (92, 80, 70), (141, 151, 127): (128, 114, 100),
    (171, 194, 188): (160, 146, 128), (242, 234, 241): (196, 186, 170),
}
FLOUR_SACK: dict[Rgb, Rgb] = {(230, 106, 58): (232, 226, 216), (150, 83, 64): (184, 176, 168)}
# item -> (arquivo em ninja-adventure/items, troca de cores)
PACK: dict[str, tuple[str, dict[Rgb, Rgb]]] = {
    "stone": ("Rock", {}),
    "fish": ("Fish", {}),
    "firewood": ("Branch", {}),
    "flour": ("Bag", FLOUR_SACK),
    "iron_ingot": ("BarIron", {}),
    "iron_axe": ("Axe", {}),
    "iron_pickaxe": ("Pickaxe", {}),
    "stone_axe": ("Axe", STONE_HEAD),
    "stone_pickaxe": ("Pickaxe", STONE_HEAD),
}

PALETTE: dict[str, tuple[int, int, int]] = {
    "1": WOOD[0], "2": WOOD[1], "3": WOOD[2],
    "p": (0xE8, 0xC8, 0x94), "m": (0xB0, 0x78, 0x50),            # cerne da madeira
    "a": (0x55, 0x5A, 0x6A), "b": (0x8A, 0x8F, 0x9A), "c": (0xC8, 0xCC, 0xD0),  # pedra do minério
    "y": (0xB0, 0x7A, 0x2A), "Y": (0xE0, 0xB0, 0x48), "Z": (0xFF, 0xE1, 0x66),  # trigo
    "q": (0xB8, 0xB0, 0xA8), "Q": (0xE8, 0xE2, 0xD8), "R": (0xFF, 0xFB, 0xF2),  # lã
    "o": (0x9A, 0x4A, 0x2A), "O": (0xD0, 0x78, 0x40),            # veio de ferro
    "k": (0x7A, 0x40, 0x28), "K": (0xA8, 0x60, 0x3A), "L": (0xC8, 0x84, 0x58),  # barro
    "x": (0x20, 0x22, 0x28), "X": (0x3A, 0x3C, 0x44), "V": (0x60, 0x64, 0x70),  # carvão
    "e": FIRE[2],
}

ICONS: dict[str, tuple[str, ...]] = {
    "wood": (
        "..........",
        "..........",
        "..........",
        ".3333333p.",
        "32222223pm",
        "2222222pmp",
        "2111112mpm",
        ".1111111p.",
        "..........",
        "..........",
    ),
    "iron_ore": (
        "..........",
        "..........",
        "...bbb....",
        "..bcOob...",
        ".bccbbbOa.",
        ".bObbboaa.",
        "aobbbbbaaa",
        "abbbOobaaa",
        ".aaaaaaaa.",
        "..........",
    ),
    "clay": (
        "..........",
        "..........",
        "..........",
        "...LLK....",
        "..LLKKKk..",
        ".LKKKKKKk.",
        ".KKKKKKkk.",
        "kKKKKkkkkk",
        ".kkkkkkkk.",
        "..........",
    ),
    "wheat": (
        ".Z..Z..Z..",
        ".YZ.YZ.YZ.",
        "..YZYZYZ..",
        "...YYYY...",
        "....yY....",
        "...2222...",
        "....yY....",
        "...y.Yy...",
        "..y...Yy..",
        "..........",
    ),
    "bread": (
        "..........",
        "..........",
        "...3333...",
        "..3pp3332.",
        ".33p33p32.",
        ".3333p3322",
        ".22333322.",
        "..122221..",
        "...1111...",
        "..........",
    ),
    "wool": (
        "..........",
        "...QQQ....",
        "..QRRQQ...",
        ".QRQQRQQ..",
        ".QRRQQQRQ.",
        ".QQQRQQQq.",
        ".qQQQQRqq.",
        "..qqQqqq..",
        "...qqq....",
        "..........",
    ),
    "charcoal": (
        "..........",
        "..........",
        "....XV....",
        "...XVXx...",
        "..xXXxeX..",
        ".XVxxXXXx.",
        ".xXXXxXVx.",
        "xxXxexXxxx",
        ".xxxxxxxx.",
        "..........",
    ),
}

def draw(rows: tuple[str, ...]) -> Image.Image:
    """Desenha o mapa com 1 px de borda e contorna a silhueta por fora."""
    assert len(rows) == SIZE and all(len(r) == SIZE for r in rows), rows
    size = SIZE + 2
    img = Image.new("RGBA", (size, size))
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != ".":
                img.putpixel((x + 1, y + 1), (*PALETTE[ch], 255))
    alpha = img.getchannel("A").load()
    edge = [(x, y) for y in range(size) for x in range(size) if alpha[x, y] == 0 and any(
        0 <= x + dx < size and 0 <= y + dy < size and alpha[x + dx, y + dy]
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
    for x, y in edge:
        img.putpixel((x, y), (*OUTLINE, 255))
    return img


def recolor(img: Image.Image, colors: dict[Rgb, Rgb]) -> Image.Image:
    out = img.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a and (r, g, b) in colors:
                px[x, y] = (*colors[(r, g, b)], a)
    return out


def centered(img: Image.Image) -> Image.Image:
    canvas = Image.new("RGBA", (ICON, ICON))
    canvas.alpha_composite(img, ((ICON - img.width) // 2, (ICON - img.height) // 2))
    return canvas


def icon(item: str) -> Image.Image:
    own = OWN_ITEMS / f"{item}.png"
    if own.exists():
        return centered(Image.open(own).convert("RGBA"))
    if item in PACK:
        file, colors = PACK[item]
        return centered(recolor(Image.open(PACK_ITEMS / f"{file}.png").convert("RGBA"), colors))
    return centered(draw(ICONS[item]))


def item_frames(items: list[str]) -> dict[str, Image.Image]:
    return {f"item_{item}": icon(item) for item in items}
