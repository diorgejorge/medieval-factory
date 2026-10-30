"""Monta os atlas de terreno e de objetos a partir do pacote Ninja Adventure (CC0).

Fonte: assets/vendor/ninja-adventure/ (só os PNGs usados + licença).
Saída: assets/terrain/terrain.{png,json} e assets/objects/objects.{png,json}, no formato de spritesheet do Pixi.
Uso: python3 assets/_tools/build_terrain.py
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageOps

ASSETS = Path(__file__).resolve().parent.parent
VENDOR = ASSETS / "vendor" / "ninja-adventure"
TILE = 16
HALF = TILE // 2
PAD = 1  # borda extrudada em cada frame: evita "costuras" ao dar zoom

Cell = tuple[int, int]  # (coluna, linha) na grade 16x16 de um tileset


def load(name: str) -> Image.Image:
    return Image.open(VENDOR / name).convert("RGBA")


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
    animations = {}
    for name, frames_list in (("watermill", strip(WATERMILL, 34, 36)),
                              ("windmill_blades", strip(MILL_PROPELLER, 64, 64))):
        animations[name] = [f"{name}_{i}" for i in range(len(frames_list))]
        frames.update(zip(animations[name], frames_list))
    return frames, animations


# ---------- saída ----------

def write_atlas(frames: dict[str, Image.Image], out: Path, cols: int,
                animations: dict[str, list[str]] | None = None, anchor: dict | None = None) -> None:
    cell_w = max(img.width for img in frames.values()) + 2 * PAD
    cell_h = max(img.height for img in frames.values()) + 2 * PAD
    rows = -(-len(frames) // cols)
    atlas = Image.new("RGBA", (cols * cell_w, rows * cell_h))
    meta_frames = {}
    for i, (name, img) in enumerate(frames.items()):
        x, y = (i % cols) * cell_w + PAD, (i // cols) * cell_h + PAD
        padded = img.resize((img.width + 2 * PAD, img.height + 2 * PAD), Image.NEAREST)
        padded.paste(img, (PAD, PAD))  # borda: pixels vizinhos esticados (extrusão aproximada)
        atlas.alpha_composite(padded, (x - PAD, y - PAD))
        entry = {
            "frame": {"x": x, "y": y, "w": img.width, "h": img.height},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": img.width, "h": img.height},
            "sourceSize": {"w": img.width, "h": img.height},
        }
        if anchor:
            entry["anchor"] = anchor
        meta_frames[name] = entry
    out.parent.mkdir(parents=True, exist_ok=True)
    png = out.with_suffix(".png")
    atlas.save(png, optimize=True)
    sheet = {
        "frames": meta_frames,
        "meta": {"app": "assets/_tools/build_terrain.py", "version": "2", "image": png.name,
                 "format": "RGBA8888", "size": {"w": atlas.width, "h": atlas.height}, "scale": "1"},
    }
    if animations:
        sheet["animations"] = animations
    out.with_suffix(".json").write_text(json.dumps(sheet, indent=2) + "\n")
    print(f"{len(frames)} frames -> {png} ({atlas.width}x{atlas.height})")


def build() -> None:
    terrain = {f"{name}_{i}": img for name, imgs in base_frames().items() for i, img in enumerate(imgs)}
    terrain.update(transition_frames())
    write_atlas(terrain, ASSETS / "terrain" / "terrain.json", cols=16,
                animations={"water_ripple": [f"water_ripple_{i}" for i in range(4)]})
    objects, animations = object_frames()
    write_atlas(objects, ASSETS / "objects" / "objects.json", cols=8,
                animations=animations, anchor={"x": 0.5, "y": 1.0})


if __name__ == "__main__":
    build()
