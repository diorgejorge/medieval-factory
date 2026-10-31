# Arte própria (djorge)

Esta pasta substitui, aos poucos, o pacote provisório `../ninja-adventure/`. O build
(`python3 assets/_tools/build_terrain.py`) sempre prefere o arquivo daqui.

| Coloque aqui | Substitui | Regra |
|---|---|---|
| `TilesetFloor.png`, `TilesetWater.png`, `TilesetNature.png`, `WaterRipples.png`, `TilesetHouse.png`, `Watermill.png`, `MillPropeller.png` | o arquivo de mesmo nome em `ninja-adventure/` | Mesmo tamanho e mesma grade 16×16 do original (o build recorta pelas mesmas posições) |
| `buildings/<id>.png` (ex.: `buildings/forge.png`) | a construção gerada de `assets/source/<id>.png` | Já em pixel art no tamanho final, fundo transparente, base embaixo e centrada |

Ids das construções: `storage`, `workbench`, `quarry`, `mine`, `lumberjack`, `farm`, `mill`,
`charcoal_kiln`, `smelter`, `forge` (de `data/jogo/construcoes.json`).
