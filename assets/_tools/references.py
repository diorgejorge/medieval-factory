"""Construções vindas de imagens de referência do usuário (assets/source/), reduzidas para a grade de pixels.

Importar uma imagem nova (uma vez): `python3 assets/_tools/references.py <imagem> <id>` tira o fundo claro ligado
à borda, recorta e guarda `assets/source/<id>.png` numa resolução intermediária (leve para o repositório).
No build, cada PNG é reduzido (Lanczos), tem a transparência cortada em 50%, o contraste realçado, a paleta
limitada e o contorno de 1 px redesenhado para casar com o resto do atlas.
"""

from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image, ImageEnhance

OUTLINE = (0x14, 0x1B, 0x1B, 255)
BACKGROUND_MIN = 225  # canal mínimo para contar como fundo claro
COLORS = 32
CONTRAST = 1.15  # devolve o contraste que a redução tira
DEFAULT_WIDTH = 72  # largura final em px; a fazenda (3x3) é maior para ler bem
WIDTHS = {"farm": 88}
SOURCE_SCALE = 4  # resolução guardada em assets/source, relativa à largura final


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
    """Um frame por imagem em `source` (nome do arquivo = id da construção), na largura de WIDTHS."""
    return {path.stem: pixelate(Image.open(path).convert("RGBA"), WIDTHS.get(path.stem, DEFAULT_WIDTH))
            for path in sorted(source.glob("*.png"))}


def import_reference(image: Path, name: str, source: Path) -> Path:
    """Tira o fundo, recorta e guarda a referência com SOURCE_SCALE vezes a largura final."""
    img = remove_background(Image.open(image))
    img = img.crop(img.getbbox())
    width = WIDTHS.get(name, DEFAULT_WIDTH) * SOURCE_SCALE
    out = source / f"{name}.png"
    img.resize((width, round(img.height * width / img.width)), Image.LANCZOS).save(out, optimize=True)
    return out


if __name__ == "__main__":
    import sys

    print(import_reference(Path(sys.argv[1]), sys.argv[2], Path(__file__).resolve().parents[1] / "source"))
