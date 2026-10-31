"""Construções vindas de imagens de referência do usuário (assets/source/), reduzidas para a grade de pixels.

Importar uma imagem nova (uma vez): `python3 assets/_tools/references.py <imagem> <id>` tira o fundo claro ligado
à borda, recorta e guarda `assets/source/<id>.png` numa resolução intermediária (leve para o repositório).
No build, cada PNG perde o tablado da maquete, é clareado, reduzido (Lanczos), tem a transparência cortada em 50%, o contraste realçado, a paleta
limitada e o contorno de 1 px redesenhado para casar com o resto do atlas.
"""

from __future__ import annotations

import json
from collections import deque
from pathlib import Path

from PIL import Image, ImageEnhance

OUTLINE = (0x14, 0x1B, 0x1B, 255)
BACKGROUND_MIN = 225  # canal mínimo para contar como fundo claro
COLORS = 32
CONTRAST = 1.15  # devolve o contraste que a redução tira
BRIGHTNESS, SATURATION = 1.18, 1.1  # aproxima das cores claras do terreno
SIDE_FACE = 24  # altura máxima (px na fonte) das laterais de terra do tablado
TILE = 16
OVERHANG_PX = 4  # a arte pode passar 2 px de cada lado do terreno ocupado, nunca mais que isso
HD_DENSITY = 2  # alta definição: 2 pixels da arte por pixel do chão (o render desenha na metade do tamanho)
SOURCE_WIDTH = 288  # largura guardada em assets/source: folga para qualquer tamanho final
DEFAULT_WIDTH = 4 * TILE + OVERHANG_PX  # construção nova que ainda não está em data/jogo: 4x4, como as outras
SCENERY_WIDTHS = {"tree_round": 3 * TILE, "tree_pine": 3 * TILE}  # árvores: copa de 3 tiles, proporcional às construções 4x4
BUILDINGS = Path(__file__).resolve().parents[2] / "data" / "jogo" / "construcoes.json"


def footprint_widths(data: Path = BUILDINGS) -> dict[str, int]:
    """Largura final de cada construção: o terreno ocupado (data/jogo) mais a folga."""
    buildings = json.loads(data.read_text())["buildings"]
    widths = {b.get("frame", b["id"]): b["width"] * TILE + OVERHANG_PX for b in buildings}
    return widths | SCENERY_WIDTHS


def remove_background(img: Image.Image) -> Image.Image:
    """Apaga o fundo claro alcançável a partir da borda (preenchimento por inundação)."""
    rgba = img.convert("RGBA")
    px, (w, h) = rgba.load(), rgba.size
    queue = deque((x, y) for x in range(w) for y in (0, h - 1))
    queue.extend((x, y) for y in range(h) for x in (0, w - 1))
    seen = set()
    while queue:
        x, y = queue.popleft()
        if (x, y) in seen or not (0 <= x < w and 0 <= y < h):
            continue
        seen.add((x, y))
        if min(px[x, y][:3]) < BACKGROUND_MIN:
            continue
        px[x, y] = (0, 0, 0, 0)
        queue.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    return rgba


def is_grass(c: tuple[int, ...]) -> bool:
    return c[1] > c[0] + 10 and c[1] > c[2] + 8


def strip_base(img: Image.Image) -> Image.Image:
    """Tira o tablado da maquete: as laterais de terra embaixo e a grama do topo ligada a elas.

    Assim o prédio assenta direto no terreno do jogo, em vez de virar uma maquete solta por cima.
    """
    img = img.copy()
    px, (w, h) = img.load(), img.size
    queue: deque[tuple[int, int]] = deque()
    for x in range(w):  # de baixo para cima em cada coluna, até achar a grama do topo
        bottom = next((y for y in range(h - 1, -1, -1) if px[x, y][3] > 128), None)
        if bottom is None:
            continue
        for y in range(bottom, max(bottom - SIDE_FACE, -1), -1):
            if is_grass(px[x, y]):
                queue.append((x, y))
                break
            px[x, y] = (0, 0, 0, 0)
    seen: set[tuple[int, int]] = set()
    while queue:  # grama ligada à borda (musgo do telhado fica, por não estar ligado)
        x, y = queue.popleft()
        if (x, y) in seen or not (0 <= x < w and 0 <= y < h):
            continue
        seen.add((x, y))
        if px[x, y][3] <= 128 or not is_grass(px[x, y]):
            continue
        px[x, y] = (0, 0, 0, 0)
        queue.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    return img


def brighten(img: Image.Image) -> Image.Image:
    rgb = ImageEnhance.Color(ImageEnhance.Brightness(img.convert("RGB")).enhance(BRIGHTNESS)).enhance(SATURATION)
    rgb.putalpha(img.getchannel("A"))
    return rgb


def pixelate(img: Image.Image, width: int) -> Image.Image:
    """Recorta, reduz para `width` px de largura, binariza o alfa, reduz cores e põe contorno."""
    img = img.crop(img.getbbox())
    height = round(img.height * width / img.width)
    small = img.resize((width, height), Image.LANCZOS)
    alpha = small.getchannel("A").point(lambda a: 255 if a >= 128 else 0)
    vivid = ImageEnhance.Contrast(small.convert("RGB")).enhance(CONTRAST)
    colors = vivid.quantize(COLORS, dither=Image.Dither.NONE).convert("RGBA")
    colors.putalpha(alpha)
    return add_outline(colors)


def add_outline(img: Image.Image) -> Image.Image:
    """Borda de 1 px em volta da silhueta, por fora, como no resto do atlas."""
    w, h = img.size
    out = Image.new("RGBA", (w + 2, h + 2))
    out.alpha_composite(img, (1, 1))
    src = out.copy().load()
    px = out.load()
    for y in range(h + 2):
        for x in range(w + 2):
            if src[x, y][3]:
                continue
            if any(0 <= x + dx < w + 2 and 0 <= y + dy < h + 2 and src[x + dx, y + dy][3]
                   for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                px[x, y] = OUTLINE
    return out


def reference_frames(source: Path) -> dict[str, Image.Image]:
    """Um frame por imagem em `source` (nome do arquivo = frame da construção), na largura do terreno, em HD_DENSITY."""
    widths = footprint_widths()
    frames = {}
    for path in sorted(source.glob("*.png")):
        img = Image.open(path).convert("RGBA")
        base_free = cut_below_trunk(img) if path.stem in SCENERY_WIDTHS else strip_base(img)
        frames[path.stem] = pixelate(brighten(base_free), widths.get(path.stem, DEFAULT_WIDTH) * HD_DENSITY)
    return frames


def cut_below_trunk(img: Image.Image) -> Image.Image:
    """Árvore em maquete: corta o losango da base logo abaixo do tronco (linha mais estreita acima do losango)."""
    alpha = img.getchannel("A").load()
    w, h = img.size
    widths = [sum(1 for x in range(w) if alpha[x, y]) for y in range(h)]
    widest = max(range(h * 7 // 10, h), key=lambda y: widths[y])  # meio do losango, no terço de baixo
    trunk = min((y for y in range(h // 2, widest) if widths[y]), key=lambda y: widths[y])
    cut = min(h, trunk + h // 40)  # um pouco de tronco abaixo da linha mais estreita
    return img.crop((0, 0, w, cut))


def import_reference(image: Path, name: str, source: Path) -> Path:
    """Tira o fundo, recorta e guarda a referência com SOURCE_WIDTH px de largura."""
    img = remove_background(Image.open(image))
    img = img.crop(img.getbbox())
    out = source / f"{name}.png"
    img.resize((SOURCE_WIDTH, round(img.height * SOURCE_WIDTH / img.width)), Image.LANCZOS).save(out, optimize=True)
    return out


if __name__ == "__main__":
    import sys

    print(import_reference(Path(sys.argv[1]), sys.argv[2], Path(__file__).resolve().parents[1] / "source"))
