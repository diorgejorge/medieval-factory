"""Camponês (jogador e servos) a partir da referência do usuário em assets/source/peasant_ref.jpg.

A referência é uma folha 4x2 com 8 direções sobre um xadrez cinza/branco (faz parte da imagem). O fundo sai por
cor (cinza claro sem saturação); o nome da direção no canto vira mancha solta e some com o maior recorte, o recorte de cada direção é reduzido para HD (2 px da arte por px do chão) e as
cores são presas a uma paleta curta, com contorno escuro de 1 px. Saída: `peasant_<dir>` parado e
`peasant_<dir>_walk` (2 quadros: o corpo sobe 1 px no segundo).
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter

from machines import OUTLINE

SOURCE = Path(__file__).resolve().parent.parent / "source" / "peasant_ref.jpg"
GRID = (
    ("n", "ne", "e", "se"),
    ("s", "sw", "w", "nw"),
)
HEIGHT_PX = 44           # altura da arte em HD (= 22 px do chão, ~1,4 tile)
COLORS = 18              # paleta curta, no espírito do pacote
SATURATION = 1.3         # a referência é escura e lavada; na tela pequena precisa de mais cor
CONTRAST = 1.15
BACKGROUND_MIN = 170     # brilho mínimo do xadrez
BACKGROUND_MAX_CHROMA = 22


def is_background(r: int, g: int, b: int) -> bool:
    return min(r, g, b) >= BACKGROUND_MIN and max(r, g, b) - min(r, g, b) <= BACKGROUND_MAX_CHROMA


def cutout(cell: Image.Image) -> Image.Image:
    """Tira o xadrez e as manchas soltas, ficando só com a maior silhueta."""
    rgb = cell.convert("RGB")
    mask = Image.new("L", rgb.size)
    mask.putdata([0 if is_background(*p) else 255 for p in rgb.getdata()])
    # Fecha buracos de JPEG dentro da figura e apaga respingos pequenos fora dela.
    mask = mask.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(3))
    figure = largest_blob(mask)
    out = rgb.convert("RGBA")
    out.putalpha(figure)
    return out.crop(figure.getbbox())


def largest_blob(mask: Image.Image) -> Image.Image:
    """Componente conexo de maior área (a figura); o resto vira fundo."""
    w, h = mask.size
    on = mask.load()
    label = [[0] * w for _ in range(h)]
    best, best_size, current = 0, 0, 0
    for sy in range(h):
        for sx in range(w):
            if not on[sx, sy] or label[sy][sx]:
                continue
            current += 1
            label[sy][sx] = current
            stack, size = [(sx, sy)], 0
            while stack:
                x, y = stack.pop()
                size += 1
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and on[nx, ny] and not label[ny][nx]:
                        label[ny][nx] = current
                        stack.append((nx, ny))
            if size > best_size:
                best, best_size = current, size
    out = Image.new("L", mask.size)
    out.putdata([255 if label[y][x] == best else 0 for y in range(h) for x in range(w)])
    return out


def shrink(figure: Image.Image) -> Image.Image:
    """Reduz para HEIGHT_PX de altura com alfa binário e cores avivadas."""
    width = max(1, round(figure.width * HEIGHT_PX / figure.height))
    small = figure.resize((width, HEIGHT_PX), Image.BOX)
    alpha = small.getchannel("A").point(lambda a: 255 if a >= 128 else 0)
    rgb = ImageEnhance.Contrast(ImageEnhance.Color(small.convert("RGB")).enhance(SATURATION)).enhance(CONTRAST)
    rgb.putalpha(alpha)
    return rgb


def pixelate(small: Image.Image, palette: Image.Image) -> Image.Image:
    """Prende as cores à paleta comum e contorna por fora."""
    colors = small.convert("RGB").quantize(palette=palette, dither=Image.Dither.NONE).convert("RGB")
    canvas = Image.new("RGBA", (small.width + 2, small.height + 1))
    canvas.paste(colors, (1, 0), small.getchannel("A"))
    return outlined(canvas)


def outlined(img: Image.Image) -> Image.Image:
    a = img.getchannel("A").load()
    w, h = img.size
    edge = [(x, y) for y in range(h) for x in range(w) if not a[x, y] and any(
        0 <= x + dx < w and 0 <= y + dy < h and a[x + dx, y + dy]
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
    for x, y in edge:
        img.putpixel((x, y), (*OUTLINE, 255))
    return img


def shared_palette(figures: list[Image.Image]) -> Image.Image:
    """Uma paleta só para as 8 direções, para a cor não pular quando o personagem vira."""
    strip = Image.new("RGB", (sum(f.width for f in figures), max(f.height for f in figures)))
    x = 0
    for f in figures:
        strip.paste(f.convert("RGB"), (x, 0), f.getchannel("A"))
        x += f.width
    return strip.quantize(colors=COLORS, method=Image.Quantize.MAXCOVERAGE)


def bob(img: Image.Image) -> Image.Image:
    """Segundo quadro da caminhada: o corpo sobe 1 px, os pés (últimas 4 linhas) ficam."""
    out = Image.new("RGBA", img.size)
    feet = img.height - 4
    out.paste(img.crop((0, 1, img.width, feet + 1)), (0, 0))
    out.paste(img.crop((0, feet, img.width, img.height)), (0, feet))
    return outlined(out)


def character_frames() -> tuple[dict[str, Image.Image], dict[str, list[str]]]:
    sheet = Image.open(SOURCE)
    cell_w, cell_h = sheet.width // len(GRID[0]), sheet.height // len(GRID)
    figures = {
        direction: cutout(sheet.crop((col * cell_w, row * cell_h, (col + 1) * cell_w, (row + 1) * cell_h)))
        for row, names in enumerate(GRID) for col, direction in enumerate(names)
    }
    small = {direction: shrink(figure) for direction, figure in figures.items()}
    palette = shared_palette(list(small.values()))
    frames: dict[str, Image.Image] = {}
    animations: dict[str, list[str]] = {}
    for direction, figure in small.items():
        still = pixelate(figure, palette)
        name = f"peasant_{direction}"
        frames[name] = still
        frames[f"{name}_walk_1"] = bob(still)
        animations[f"{name}_walk"] = [name, f"{name}_walk_1"]
    return frames, animations
