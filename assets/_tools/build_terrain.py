"""Monta os atlas de terreno e de objetos a partir do pacote Ninja Adventure (CC0).

Fonte: assets/vendor/djorge/ (arte própria) com o pacote assets/vendor/ninja-adventure/ como provisório:
cada arquivo em djorge/ substitui o de mesmo nome do pacote.
Saída: assets/terrain/terrain.{png,json} e assets/objects/objects.{png,json}, no formato de spritesheet do Pixi.
Uso: python3 assets/_tools/build_terrain.py
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageOps

from items import item_frames
from machines import machine_frames
from references import HD_DENSITY, reference_frames
from transport import transport_frames

ASSETS = Path(__file__).resolve().parent.parent
OWN_ART = ASSETS / "vendor" / "djorge"
PLACEHOLDER = ASSETS / "vendor" / "ninja-adventure"
TILE = 16
HALF = TILE // 2
PAD = 1  # borda extrudada em cada frame: evita "costuras" ao dar zoom

Cell = tuple[int, int]  # (coluna, linha) na grade 16x16 de um tileset


def own_buildings(folder: Path) -> dict[str, Image.Image]:
    """Construções já desenhadas em pixel art (djorge/buildings/<id>.png): entram como estão, sem redução."""
    return {path.stem: Image.open(path).convert("RGBA") for path in sorted(folder.glob("*.png"))}


def load(name: str) -> Image.Image:
    """Tileset pelo nome: a versão própria em djorge/ quando existe, senão a do pacote."""
    own = OWN_ART / name
    return Image.open(own if own.exists() else PLACEHOLDER / name).convert("RGBA")


FLOOR, WATER, NATURE = load("TilesetFloor.png"), load("TilesetWater.png"), load("TilesetNature.png")
RIPPLES = load("WaterRipples.png")
HOUSE, WATERMILL, MILL_PROPELLER = load("TilesetHouse.png"), load("Watermill.png"), load("MillPropeller.png")


def tile(sheet: Image.Image, cell: Cell, w: int = 1, h: int = 1) -> Image.Image:
    c, r = cell
    return sheet.crop((c * TILE, r * TILE, (c + w) * TILE, (r + h) * TILE))


def over(base: Image.Image, top: Image.Image) -> Image.Image:
    out = base.copy()
    out.alpha_composite(top)
    return out


# ---------- transições: dual grid montado por quadrantes ----------

# Ordem dos cantos/quadrantes: 0 = NO, 1 = NE, 2 = SO, 3 = SE.
QUADRANT = {0: (0, 0), 1: (HALF, 0), 2: (0, HALF), 3: (HALF, HALF)}


def dual_tile(sheet: Image.Image, patch: Cell, hole: Cell, background: Image.Image,
              patch_mask: int) -> Image.Image:
    """Tile da grade dual a partir de um autotile "blob" do pacote.

    `patch_mask`: bit k = 1 se o canto k é o terreno da mancha (o que desenha a borda).
    Cada quadrante do tile dual é o quadrante da célula do canto voltado para o centro; ele só
    depende dos vizinhos dessa célula (os outros cantos), então sai do bloco 3x3 da mancha
    (`patch`) ou do bloco 2x2 do "buraco" (`hole`, cantos internos).
    """
    def is_patch(k: int) -> bool:
        return bool((patch_mask >> k) & 1)

    out = Image.new("RGBA", (TILE, TILE))
    for k, (qx, qy) in QUADRANT.items():
        if not is_patch(k):
            src = background
        else:
            looks_right, looks_down = k in (0, 2), k in (0, 1)
            horiz, vert, diag = k ^ 1, k ^ 2, k ^ 3
            if is_patch(horiz) and is_patch(vert) and not is_patch(diag):
                src = tile(sheet, (hole[0] + (0 if looks_right else 1), hole[1] + (0 if looks_down else 1)))
            else:
                cx = 1 if is_patch(horiz) else (2 if looks_right else 0)
                cy = 1 if is_patch(vert) else (2 if looks_down else 0)
                src = tile(sheet, (patch[0] + cx, patch[1] + cy))
        sx, sy = QUADRANT[3 - k]
        out.paste(src.crop((sx, sy, sx + HALF, sy + HALF)), (qx, qy))
    return out


def recolor(img: Image.Image, src_ref: Image.Image, dst_ref: Image.Image) -> Image.Image:
    """Troca as cores de `src_ref` pelas de `dst_ref`, casando por luminância (escuro->escuro)."""
    def ramp(ref: Image.Image) -> list[tuple[int, ...]]:
        cols = {p for p in ref.get_flattened_data() if p[3]}
        return sorted(cols, key=lambda c: 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2])

    src, dst = ramp(src_ref), ramp(dst_ref)
    lookup = {c: dst[round(i * (len(dst) - 1) / max(len(src) - 1, 1))] for i, c in enumerate(src)}
    out = img.copy()
    out.putdata([lookup.get(p, p) for p in img.get_flattened_data()])
    return out


GRASS = tile(FLOOR, (0, 12))
DIRT = tile(FLOOR, (1, 8))
SAND = tile(WATER, (0, 5))  # mesma areia da margem do lago
WATER_BASE = tile(WATER, (1, 1))

# nome: (tileset, origem do bloco 3x3, origem do buraco 2x2, fundo, nosso bit = canto que é...)
# Nossos nomes seguem `<a>_<b>_<máscara>` com bit = canto do terreno `a`; no pacote quem desenha a
# borda é a mancha, por isso a máscara é invertida quando `a` é o fundo.
TRANSITIONS = {
    "grass_dirt": (FLOOR, (0, 7), (5, 8), GRASS, "background"),
    "grass_water": (WATER, (0, 6), (5, 7), tile(WATER, (0, 11)), "background"),
    "sand_water": (WATER, (0, 0), (5, 1), tile(WATER, (0, 5)), "background"),
}


def transition_frames() -> dict[str, Image.Image]:
    frames = {}
    for name, (sheet, patch, hole, background, bit_is) in TRANSITIONS.items():
        for mask in range(16):
            patch_mask = 15 - mask if bit_is == "background" else mask
            frames[f"{name}_{mask}"] = dual_tile(sheet, patch, hole, background, patch_mask)
    # Grama/areia não existe no pacote: reaproveita a borda grama/terra com a terra pintada de areia.
    for mask in range(16):
        frames[f"grass_sand_{mask}"] = recolor(frames[f"grass_dirt_{mask}"], DIRT, SAND)
    return frames


# ---------- tiles base ----------

def ore_node(row: int, gem_to: tuple[tuple[int, int, int], ...] | None) -> list[Image.Image]:
    """Jazida = terra + pedra com cristais do pacote; `gem_to` recolore os cristais (escuro->claro)."""
    full, partial, depleted = (tile(NATURE, (c, row)) for c in (4, 5, 6))
    nodes = [full, partial]
    if gem_to:
        rock = {p for p in depleted.get_flattened_data() if p[3]}

        def paint(img: Image.Image) -> Image.Image:
            gems = sorted({p for p in img.get_flattened_data() if p[3] and p not in rock},
                          key=lambda c: c[0] + c[1] + c[2])
            lookup = {c: (*gem_to[min(i * len(gem_to) // max(len(gems), 1), len(gem_to) - 1)], 255)
                      for i, c in enumerate(gems)}
            out = img.copy()
            out.putdata([lookup.get(p, p) for p in img.get_flattened_data()])
            return out

        nodes = [paint(n) for n in nodes]
    nodes += [ImageOps.mirror(n) for n in nodes]
    return [over(DIRT, n) for n in nodes]


def base_frames() -> dict[str, list[Image.Image]]:
    rocks = [tile(NATURE, (6, 14)), tile(NATURE, (6, 15))]
    clays = [tile(NATURE, (4, 13)), tile(NATURE, (6, 17))]
    return {
        "grass": [tile(FLOOR, (c, 12)) for c in (0, 2, 3, 4)],
        "dirt": [DIRT, tile(FLOOR, (8, 8)), tile(FLOOR, (8, 9)), tile(FLOOR, (1, 11))],
        "sand": [recolor(tile(FLOOR, (c, 5)), tile(FLOOR, (0, 5)), SAND) for c in (0, 1, 2, 3)],
        "water": [WATER_BASE] * 4,
        # Ondinha animada para salpicar em alguns tiles de água (não em todos, para não virar padrão).
        "water_ripple": [over(WATER_BASE, RIPPLES.crop((f * TILE, 0, (f + 1) * TILE, TILE))) for f in range(4)],
        "forest": [tile(FLOOR, (c, 12)) for c in (11, 13, 14, 15)],
        "rock": [over(DIRT, r) for r in rocks + [ImageOps.mirror(r) for r in rocks]],
        "ore_iron": ore_node(15, ((92, 40, 28), (150, 70, 45), (196, 110, 70))),
        "ore_coal": ore_node(14, ((22, 20, 26), (52, 50, 58), (96, 94, 104))),
        "ore_copper": ore_node(14, None),
        "ore_zinc": ore_node(16, ((120, 140, 150), (176, 196, 200), (226, 236, 236))),
        "clay": [over(DIRT, c) for c in clays + [ImageOps.mirror(c) for c in clays]],
    }


# ---------- objetos ----------

def strip(sheet: Image.Image, w: int, h: int) -> list[Image.Image]:
    """Quadros de animação lado a lado numa tira horizontal."""
    return [sheet.crop((i * w, 0, (i + 1) * w, h)) for i in range(sheet.width // w)]


# Construções do pacote: (coluna, linha, largura, altura) em tiles do TilesetHouse.
BUILDINGS: dict[str, tuple[int, int, int, int]] = {
    "house_thatch": (0, 0, 4, 3),
    "house_flat": (4, 0, 4, 3),
    "house_tile": (12, 0, 4, 3),
    "hut_mud": (0, 7, 3, 3),
    "hut_straw": (3, 7, 3, 3),
    "oven_clay": (29, 11, 2, 2),
    "oven_stone": (29, 13, 2, 2),
}


# ---------- construções giradas (vista 3/4) ----------
# Rotação horária: r0 = S (arte original, frente para a câmera), r1 = O, r2 = N, r3 = L.
# Na vista 3/4 só a parede sul aparece: r2 mostra o fundo (sem porta) e r1/r3 mostram a fachada estreita,
# com o telhado mais comprido (largura e profundidade trocam) e a porta no canto do lado para onde ela abre.


def patch_from(img: Image.Image, box: tuple[int, int, int, int], dx: int) -> Image.Image:
    """Cobre `box` copiando a mesma área deslocada `dx` px na horizontal (apaga porta/janela)."""
    out = img.copy()
    x0, y0, x1, y1 = box
    out.paste(img.crop((x0 + dx, y0, x1 + dx, y1)), (x0, y0))
    return out


def narrow(img: Image.Image, keep: int) -> Image.Image:
    """Junta as `keep` colunas da esquerda com as `keep` da direita: fachada estreita, cantos originais."""
    out = Image.new("RGBA", (2 * keep, img.height))
    out.paste(img.crop((0, 0, keep, img.height)), (0, 0))
    out.paste(img.crop((img.width - keep, 0, img.width, img.height)), (keep, 0))
    return out


def deepen(img: Image.Image, rows: tuple[int, int], extra: int) -> Image.Image:
    """Alonga o telhado repetindo a faixa de linhas `rows` até somar `extra` px de profundidade."""
    top, bottom = rows
    band = img.crop((0, top, img.width, bottom))
    out = Image.new("RGBA", (img.width, img.height + extra))
    out.paste(img.crop((0, 0, img.width, bottom)), (0, 0))
    for y in range(bottom, bottom + extra, band.height):
        out.paste(band.crop((0, 0, img.width, min(band.height, bottom + extra - y))), (0, y))
    out.paste(img.crop((0, bottom, img.width, img.height)), (0, bottom + extra))
    return out


def plain_wall(img: Image.Image, box: tuple[int, int, int, int], wall_src: int, pillars: tuple[int, ...],
               pillar_src: int) -> Image.Image:
    """Parede lisa: cada linha de `box` repete a coluna `wall_src`; pilares copiados da coluna `pillar_src`."""
    out = img.copy()
    x0, y0, x1, y1 = box
    for y in range(y0, y1):
        for x in range(x0, x1):
            out.putpixel((x, y), img.getpixel((wall_src, y)))
        for px in pillars:
            out.putpixel((px, y), img.getpixel((pillar_src, y)))
    return out


def side_door(img: Image.Image, door: Image.Image, at: tuple[int, int]) -> Image.Image:
    out = img.copy()
    out.alpha_composite(door, at)
    return out


def rotations(name: str, base: Image.Image) -> dict[str, Image.Image]:
    """Quadros r1..r3 de uma construção do pacote (r0 é o próprio `base`)."""
    if name == "house_thatch":  # 4x2 -> 2x4
        back = plain_wall(base, (4, 33, 60, 46), wall_src=49, pillars=(21, 42), pillar_src=15)
        west = side_door(deepen(narrow(back, 16), (12, 28), 32), base.crop((17, 33, 25, 47)), (3, 65))
    elif name == "hut_straw":  # 3x2 -> 2x3
        back = patch_from(base, (17, 33, 31, 47), -14)
        west = side_door(deepen(narrow(back, 16), (38, 44), 12), base.crop((17, 34, 24, 46)), (3, 46))
    elif name == "oven_stone":  # 2x2, só a boca muda de lado
        back = patch_from(base, (11, 19, 22, 26), -9)
        west = side_door(back, base.crop((11, 19, 16, 26)).transpose(Image.FLIP_LEFT_RIGHT), (2, 19))
    else:
        raise ValueError(name)
    return {f"{name}_r1": west, f"{name}_r2": back, f"{name}_r3": ImageOps.mirror(west)}


def wheel_rotations(frames: list[Image.Image]) -> dict[str, list[Image.Image]]:
    """Roda d'água vista de cima: girar a imagem gira o eixo junto (rotação horária)."""
    turns = {1: Image.ROTATE_270, 2: Image.ROTATE_180, 3: Image.ROTATE_90}
    return {f"watermill_r{r}": [f.transpose(t) for f in frames] for r, t in turns.items()}


ROTATABLE = ("house_thatch", "hut_straw", "oven_stone")


def object_frames() -> tuple[dict[str, Image.Image], dict[str, list[str]]]:
    round_a, round_b = tile(NATURE, (0, 0), 2, 2), tile(NATURE, (16, 0), 2, 2)
    pine = tile(NATURE, (2, 0), 2, 2)
    frames = {
        "tree_round_0": round_a,
        "tree_round_1": round_b,
        "tree_pine_0": pine,
        "tree_pine_1": ImageOps.mirror(pine),
    }
    frames.update({name: tile(HOUSE, (c, r), w, h) for name, (c, r, w, h) in BUILDINGS.items()})
    for name in ROTATABLE:
        frames.update(rotations(name, frames[name]))
    animations = {}
    for name, frames_list in (("watermill", strip(WATERMILL, 34, 36)),
                              ("windmill_blades", strip(MILL_PROPELLER, 64, 64))):
        animations[name] = [f"{name}_{i}" for i in range(len(frames_list))]
        frames.update(zip(animations[name], frames_list))
    for name, rotated in wheel_rotations(strip(WATERMILL, 34, 36)).items():
        animations[name] = [f"{name}_{i}" for i in range(len(rotated))]
        frames.update(zip(animations[name], rotated))
    return frames, animations


# ---------- saída ----------

def shelf_pack(sizes: list[tuple[int, int]], max_width: int) -> tuple[list[tuple[int, int]], int, int]:
    """Prateleiras: do mais alto ao mais baixo, enche linhas até `max_width`. Devolve posições e tamanho."""
    order = sorted(range(len(sizes)), key=lambda i: -sizes[i][1])
    spots: list[tuple[int, int]] = [(0, 0)] * len(sizes)
    x = y = shelf_h = used_w = 0
    for i in order:
        w, h = sizes[i]
        if x + w > max_width:
            x, y, shelf_h = 0, y + shelf_h, 0
        spots[i] = (x, y)
        x += w
        used_w = max(used_w, x)
        shelf_h = max(shelf_h, h)
    return spots, used_w, y + shelf_h


def write_atlas(frames: dict[str, Image.Image], out: Path, max_width: int,
                animations: dict[str, list[str]] | None = None, anchor: dict | None = None,
                densities: dict[str, int] | None = None) -> None:
    """`densities`: frames desenhados com mais pixels que o chão (o render reduz pela densidade)."""
    images = list(frames.values())
    spots, width, height = shelf_pack([(img.width + 2 * PAD, img.height + 2 * PAD) for img in images], max_width)
    atlas = Image.new("RGBA", (width, height))
    meta_frames = {}
    for name, img, (sx, sy) in zip(frames, images, spots):
        x, y = sx + PAD, sy + PAD
        padded = img.resize((img.width + 2 * PAD, img.height + 2 * PAD), Image.NEAREST)
        padded.paste(img, (PAD, PAD))  # borda: pixels vizinhos esticados (extrusão aproximada)
        atlas.alpha_composite(padded, (sx, sy))
        entry = {
            "frame": {"x": x, "y": y, "w": img.width, "h": img.height},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": img.width, "h": img.height},
            "sourceSize": {"w": img.width, "h": img.height},
        }
        if anchor:
            entry["anchor"] = anchor
        if densities and name in densities:
            entry["density"] = densities[name]
        meta_frames[name] = entry
    out.parent.mkdir(parents=True, exist_ok=True)
    png = out.with_suffix(".png")
    atlas.save(png, optimize=True)
    sheet = {
        "frames": meta_frames,
        "meta": {"app": "assets/_tools/build_terrain.py", "version": "3", "image": png.name,
                 "format": "RGBA8888", "size": {"w": atlas.width, "h": atlas.height}, "scale": "1"},
    }
    if animations:
        sheet["animations"] = animations
    out.with_suffix(".json").write_text(json.dumps(sheet, indent=2) + "\n")
    print(f"{len(frames)} frames -> {png} ({atlas.width}x{atlas.height})")


def build() -> None:
    terrain = {f"{name}_{i}": img for name, imgs in base_frames().items() for i, img in enumerate(imgs)}
    terrain.update(transition_frames())
    write_atlas(terrain, ASSETS / "terrain" / "terrain.json", max_width=16 * (TILE + 2 * PAD),
                animations={"water_ripple": [f"water_ripple_{i}" for i in range(4)]})
    objects, animations = object_frames()
    machines, machine_animations = machine_frames(NATURE)
    objects.update(machines)
    animations.update(machine_animations)
    transport, transport_animations = transport_frames()
    objects.update(transport)
    animations.update(transport_animations)
    items = json.loads((ASSETS.parent / "data" / "jogo" / "itens.json").read_text())["items"]
    objects.update(item_frames([item["id"] for item in items]))
    buildings = reference_frames(ASSETS / "source")
    own = own_buildings(OWN_ART / "buildings")
    objects.update(buildings)
    objects.update(own)
    write_atlas(objects, ASSETS / "objects" / "objects.json", max_width=1024,
                animations=animations, anchor={"x": 0.5, "y": 1.0},
                densities={name: HD_DENSITY for name in buildings if name not in own})


if __name__ == "__main__":
    build()
