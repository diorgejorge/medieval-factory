"""Terreno com a arte própria (assets/source/terrain/), reduzida para tiles 16x16 em densidade 1x.

Cada textura pintada (grama, areia, água, terra) vira uma textura contínua de 128x128 (sem emenda ao repetir),
cortada numa grade 8x8: a variante i é o tile da coluna i % 8, linha i // 8. O renderizador escolhe a variante
pela posição no mapa, então tiles vizinhos usam pedaços vizinhos da textura e o chão fica contínuo.
As transições (dual grid) são geradas por um campo bilinear entre os 4 cantos, com borda de 1 px.
As pedras e o minério de ferro são os montes da maquete (references.py) reduzidos por cima da terra.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageChops, ImageEnhance, ImageFilter, ImageMath, ImageOps

from references import brighten, pixelate, strip_base

SOURCE = Path(__file__).resolve().parent.parent / "source" / "terrain"
TILE = 16
GRID = 8  # a textura tem GRID x GRID tiles
TEXTURE = TILE * GRID
VARIANTS = GRID * GRID
COLORS = 24
SEAM_BAND = 0.25  # fração do lado da textura usada para emendar as bordas
SEAM_BAND_WIDE = 0.5  # água: ondas grandes pedem emenda suave, senão aparece um degrau reto
PILE_WIDTH = TILE - 2  # largura do monte sem o contorno: com ele, ocupa o tile inteiro
GEM_COVER = 0.12  # fração de pixels de gema na fonte para o pixel reduzido virar gema
GEM_COLORS = ((248, 204, 64), (120, 200, 248))  # ouro e cristal azul, bem vivos para ler em 16 px
# Bandas largas (ondas pintadas) denunciam a repetição: tiramos parte do que o desfoque enxerga.
WAVE_BLUR = 5
WAVE_FLATTEN = {"grass": 0.6, "sand": 0.55, "dirt": 0.5}
DIRT_RAMP = ("#5a3a24", "#9a6a45", "#c99464")  # escuro, meio, claro: terra batida, longe da areia
FOREST_SHADE = 0.72  # chão de floresta = grama mais escura...
FOREST_GREEN = (0.85, 1.0, 0.8)  # ...e puxada para o verde (multiplica R, G, B)
EDGE_SHADE = 0.68  # borda do lado `a` de uma transição
WET_SHADE = 0.8  # areia molhada na margem
FOAM = (226, 240, 236)
FOAM_MIX = 0.65  # espuma por cima da água: mistura com a cor da água embaixo
RIPPLE = (196, 226, 236)
# Par de transição -> lado `a` e lado `b`, como no nome do frame (`<a>_<b>_<máscara>`).
PAIRS = (("grass", "sand"), ("grass", "dirt"), ("grass", "water"), ("sand", "water"))
# Centros dos quadrantes NO, NE, SO, SE: onde ficam os valores dos cantos no campo bilinear.
LOW, HIGH = TILE / 4, 3 * TILE / 4

Rgba = tuple[int, int, int, int]


# ---------- texturas contínuas ----------

def blend_weight(size: int, band_fraction: float) -> list[int]:
    """Peso da textura original ao longo de um eixo: 0 na borda, sobe (smoothstep) até 255 em `band_fraction` do lado.

    Faixa estreita: a cópia deslocada só aparece perto das bordas, sem duplicar tufos pelo meio da textura.
    """
    band = size * band_fraction
    weights = []
    for i in range(size):
        t = min(min(i + 0.5, size - i - 0.5) / band, 1.0)
        weights.append(round(255 * t * t * (3 - 2 * t)))
    return weights


def seamless(img: Image.Image, band_fraction: float = SEAM_BAND) -> Image.Image:
    """Torna a textura repetível: em cada eixo mistura com uma cópia deslocada meia volta.

    Na cópia deslocada a emenda fica no meio, onde o peso da original é máximo; nas bordas vale a cópia,
    cujas bordas são o meio contínuo da original. Um eixo por vez, para não sobrar emenda em cruz.
    """
    size = img.width
    weight = blend_weight(size, band_fraction)
    mask_x = Image.new("L", (size, size))
    mask_x.putdata([weight[x] for _ in range(size) for x in range(size)])
    img = Image.composite(img, ImageChops.offset(img, size // 2, 0), mask_x)
    return Image.composite(img, ImageChops.offset(img, 0, size // 2), mask_x.transpose(Image.Transpose.TRANSPOSE))


def quantize(img: Image.Image) -> Image.Image:
    return img.quantize(COLORS, dither=Image.Dither.NONE).convert("RGBA")


def flatten_waves(img: Image.Image, amount: float) -> Image.Image:
    """Baixa o contraste das formas grandes (img - amount * (desfoque - média)), mantendo o detalhe pintado."""
    blur = img.filter(ImageFilter.GaussianBlur(WAVE_BLUR))
    mean = [sum(i * n for i, n in enumerate(band.histogram())) / (img.width * img.height) for band in img.split()]
    bands = [ImageMath.lambda_eval(lambda a, m=m: a["c"] - amount * (a["b"] - m), c=c.convert("F"), b=b.convert("F"))
             for c, b, m in zip(img.split(), blur.split(), mean)]
    return Image.merge("RGB", [b.convert("L") for b in bands])


def is_water_clutter(c: tuple[int, ...]) -> bool:
    """Tufo de grama e pontinhos marrons na água: tons sem o azul dominante (a espuma clara fica)."""
    return c[0] > c[2] - 40 and c[2] < 150


def clear_water(img: Image.Image) -> Image.Image:
    """Cobre o que não é onda com as cores em volta (difusão a partir da borda da mancha)."""
    px, (w, h) = img.load(), img.size
    holes = {(x, y) for y in range(h) for x in range(w) if is_water_clutter(px[x, y])}
    for _ in range(2):  # inclui o contorno escuro do tufo
        holes |= {(x + dx, y + dy) for x, y in holes for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
                  if 0 <= x + dx < w and 0 <= y + dy < h}
    while holes:
        filled = {}
        for x, y in holes:
            near = [px[x + dx, y + dy] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
                    if 0 <= x + dx < w and 0 <= y + dy < h and (x + dx, y + dy) not in holes]
            if near:
                filled[x, y] = tuple(sum(c[i] for c in near) // len(near) for i in range(3))
        for xy, color in sorted(filled.items()):
            px[xy] = color
        holes -= filled.keys()
    return img


def dirt_tone(img: Image.Image) -> Image.Image:
    """A terra da fonte é quase da cor da areia: reaproveita só a luz e pinta na rampa de marrom."""
    gray = ImageOps.autocontrast(img.convert("L"), cutoff=1)
    return ImageOps.colorize(gray, DIRT_RAMP[0], DIRT_RAMP[2], DIRT_RAMP[1])


def texture(name: str) -> Image.Image:
    img = Image.open(SOURCE / f"{name}.png").convert("RGB")
    if name == "water":
        img = clear_water(img)
    img = img.resize((TEXTURE, TEXTURE), Image.LANCZOS)
    if name in WAVE_FLATTEN:
        img = flatten_waves(img, WAVE_FLATTEN[name])
    if name == "dirt":
        img = dirt_tone(img)
    return quantize(seamless(img, SEAM_BAND_WIDE if name == "water" else SEAM_BAND))


def forest_floor(grass: Image.Image) -> Image.Image:
    dark = ImageEnhance.Brightness(grass.convert("RGB")).enhance(FOREST_SHADE)
    channels = [c.point(lambda v, k=k: round(v * k)) for c, k in zip(dark.split(), FOREST_GREEN)]
    return quantize(Image.merge("RGB", channels))


def split(tex: Image.Image) -> list[Image.Image]:
    """Variante i = tile da coluna i % GRID, linha i // GRID."""
    return [tex.crop(((i % GRID) * TILE, (i // GRID) * TILE, (i % GRID + 1) * TILE, (i // GRID + 1) * TILE))
            for i in range(VARIANTS)]


# ---------- montes de pedra e minério ----------

def is_gem(c: tuple[int, ...]) -> int:
    """0 = não é gema, 1 = ouro, 2 = cristal azul."""
    if c[3] < 128:
        return 0
    if c[0] > 170 and c[1] > 130 and c[2] < c[1] - 50:
        return 1
    return 2 if c[2] > 170 and c[2] > c[0] + 50 else 0


def add_gems(pile: Image.Image, source: Image.Image) -> Image.Image:
    """Na redução, os pontinhos de ouro e cristal somem na média: repinta cada pixel cuja área na fonte
    tem gema suficiente com a cor viva dela. `source` já recortada, como em `pixelate` (+1 px de contorno)."""
    size = (pile.width - 2, pile.height - 2)
    kinds = [is_gem(c) for c in source.get_flattened_data()]
    out, px = pile.copy(), pile.load()
    for kind, color in enumerate(GEM_COLORS, start=1):
        mask = Image.new("L", source.size)
        mask.putdata([255 if k == kind else 0 for k in kinds])
        cover = mask.resize(size, Image.BOX).load()
        for y in range(size[1]):
            for x in range(size[0]):
                if cover[x, y] >= 255 * GEM_COVER and px[x + 1, y + 1][3]:
                    out.putpixel((x + 1, y + 1), (*color, 255))
    return out


def pile_shapes(name: str) -> list[Image.Image]:
    source = brighten(strip_base(Image.open(SOURCE / f"{name}.png").convert("RGBA")))
    # Recorta pelo alfa sólido: restos quase transparentes do tablado encolheriam o monte na redução.
    source = source.crop(source.getchannel("A").point(lambda a: 255 if a >= 128 else 0).getbbox())
    pile = add_gems(pixelate(source, PILE_WIDTH), source)
    return [pile, ImageOps.mirror(pile)]


def with_pile(ground: list[Image.Image], shapes: list[Image.Image]) -> list[Image.Image]:
    """Monte centrado e apoiado na base do tile; as duas formas alternam por variante."""
    out = []
    for i, base in enumerate(ground):
        pile = shapes[i % len(shapes)]
        tile = base.copy()
        tile.alpha_composite(pile, ((TILE - pile.width) // 2, max(TILE - pile.height, 0)))
        out.append(tile)
    return out


# ---------- água animada ----------

def ripple_frames(water: Image.Image) -> list[Image.Image]:
    """Crista de onda (arco de 5 px) que atravessa o tile em 4 quadros, 2 px por quadro."""
    frames = []
    for f in range(4):
        tile = water.copy()
        px = tile.load()
        x0 = 2 + 2 * f
        for i in range(5):
            y = 8 if i in (0, 4) else 7
            px[x0 + i, y] = mix(px[x0 + i, y], (*RIPPLE, 255), 0.75 if i in (0, 4) else 1.0)
        frames.append(tile)
    return frames


# ---------- transições (dual grid) ----------

def field(mask: int, x: float, y: float) -> float:
    """Interpolação bilinear dos 4 cantos (1 = terreno `a`) postos no centro dos quadrantes."""
    u = min(max((x - LOW) / (HIGH - LOW), 0.0), 1.0)
    v = min(max((y - LOW) / (HIGH - LOW), 0.0), 1.0)
    nw, ne, sw, se = ((mask >> bit) & 1 for bit in range(4))
    return (nw * (1 - u) + ne * u) * (1 - v) + (sw * (1 - u) + se * u) * v


def shade(c: Rgba, k: float) -> Rgba:
    return (round(c[0] * k), round(c[1] * k), round(c[2] * k), 255)


def mix(under: Rgba, top: Rgba, k: float) -> Rgba:
    return (*(round(u + (t - u) * k) for u, t in zip(under[:3], top[:3])), 255)


def transition(mask: int, tex_a: Image.Image, tex_b: Image.Image, water: bool) -> Image.Image:
    """Pinta só o que difere dos tiles base embaixo, mais a borda; o resto fica transparente.

    O tile é desenhado deslocado meio tile, centrado no canto entre as 4 células: o pixel (x, y) cai na célula
    do quadrante (x >= 8, y >= 8), na posição ((x + 8) % 16, (y + 8) % 16) dela, de onde vem a cor da textura.
    """
    inside = {(x, y): field(mask, x + 0.5, y + 0.5) > 0.5 for x in range(-1, TILE + 1) for y in range(-1, TILE + 1)}
    a, b = tex_a.load(), tex_b.load()
    out = Image.new("RGBA", (TILE, TILE))
    px = out.load()
    for y in range(TILE):
        for x in range(TILE):
            here = inside[x, y]
            cell_is_a = bool(mask >> ((y >= TILE // 2) * 2 + (x >= TILE // 2)) & 1)
            tx, ty = (x + TILE // 2) % TILE, (y + TILE // 2) % TILE
            color = a[tx, ty] if here else b[tx, ty]
            touches = any(inside[x + dx, y + dy] != here for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
            if touches and here:
                px[x, y] = shade(color, WET_SHADE if water else EDGE_SHADE)
            elif touches and water:
                px[x, y] = mix(color, (*FOAM, 255), FOAM_MIX)
            elif here != cell_is_a:
                px[x, y] = color
    return out


# ---------- tudo junto ----------

def terrain_frames() -> dict[str, Image.Image]:
    """Todos os frames de terreno próprios: tiles base (16 variantes), ondinha da água e transições."""
    textures = {name: texture(name) for name in ("grass", "sand", "water", "dirt")}
    textures["forest"] = forest_floor(textures["grass"])
    tiles = {name: split(tex) for name, tex in textures.items()}
    tiles["rock"] = with_pile(tiles["dirt"], pile_shapes("rock_pile"))
    tiles["ore_iron"] = with_pile(tiles["dirt"], pile_shapes("ore_iron_pile"))
    tiles["water_ripple"] = ripple_frames(tiles["water"][0])

    frames = {f"{name}_{i}": tile for name, variants in tiles.items() for i, tile in enumerate(variants)}
    for a, b in PAIRS:
        tex_a, tex_b = tiles[a][0], tiles[b][0]
        for mask in range(1, 15):
            frames[f"{a}_{b}_{mask}"] = transition(mask, tex_a, tex_b, b == "water")
    return frames
