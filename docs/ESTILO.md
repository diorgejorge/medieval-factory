# Guia de estilo visual

Fonte única das regras de arte. Dono: equipe visual (`assets/` e este arquivo).

## Formato

| O quê | Tamanho | Observação |
|---|---|---|
| Tiles de terreno | 16×16 | Emendam com qualquer vizinho do mesmo tipo (sem costura) |
| Máquinas e estruturas | Base 32×32 (2×2 tiles) + altura | Ex.: 32×48; estruturas maiores usam múltiplos de 32 na base |
| Itens e ícones | 16×16 | Mesmo tamanho do tile |

- **Vista 3/4 (top-down oblíquo):** o chão é plano e visto de cima; máquinas e construções mostram o
  telhado **e a parede da frente**. A grade continua ortogonal (sem isométrico).
- **Altura:** a base ocupa as células da grade (2×2 tiles = 32×32) e o sprite cresce **para cima**
  (ex.: 32×48 para uma casa térrea). Âncora do sprite = canto inferior esquerdo da base; ordenar desenho por `y` da base.
- **Cel shading em pixel art:** cada material em 3 tons chapados (claro, médio, escuro), sem degradê,
  e **contorno `ink`** de 1 px em volta da silhueta. Sombra no chão **colada à base** (senão o objeto parece flutuar): elipse achatada da largura do objeto, de ~4 px acima
  até 1 px abaixo da base, 1 px para a direita, `ink` com ~35% de opacidade
  (único caso de semitransparência, desenhada pelo motor, não no sprite).
- **Luz:** vem do noroeste. Brilho em cima-esquerda, sombra embaixo-direita.
- **Escala:** sempre inteira (×1, ×2, ×3...) e filtro *nearest*. Nunca suavizar.
- **Sem anti-aliasing** e sem semitransparência; pixel é opaco ou totalmente transparente.

## Paleta

Arquivo: [`assets/palette/palette.json`](../assets/palette/palette.json). Vale para os sprites **feitos por nós**
(máquinas, construções); o pacote Ninja Adventure usa as cores dele. Nova cor só entra na paleta (com nome),
nunca direto num sprite. A paleta será ajustada para casar com os tons do pacote junto com as primeiras máquinas.

Grupos: neutros (`ink`→`parchment`), solo/areia/argila, vegetação, água, minérios e, para a Era IV,
latão (`brass_*`), fogo (`ember`, `flame`) e cores da coroa (`royal`, `banner`).

**Por era:** madeira e solo dominam a Era I; ferrugem e cinza na II; carvão e fuligem na III; latão e cobre na IV.
Construções antigas continuam com suas cores; a era nova acrescenta, não repinta.

## Convenção de nomes

- Arquivos e frames em `snake_case`, em inglês (igual ao código).
- Frame: `<nome>_<n>`, com `n` a partir de 0. Para terreno, `n` é a variante (escolher por hash da posição);
  para animação, é o quadro.
- Animações listadas em `animations` no JSON do atlas (ex.: `water_ripple` → `water_ripple_0..3`).
- Jazidas: prefixo `ore_` (`ore_iron`, `ore_coal`, `ore_copper`, `ore_zinc`). Argila é `clay`.

## Fonte da arte

- **Arte própria (`assets/vendor/djorge/`):** é a arte definitiva. Cada arquivo lá substitui o equivalente do
  pacote provisório no build; regras de nome e tamanho em `assets/vendor/djorge/README.md`.
- **Provisório — terreno, natureza e objetos do mapa:** pacote **Ninja Adventure** (Pixel-boy e AAA), licença **CC0**
  (uso comercial livre, sem atribuição obrigatória; damos crédito nos créditos do jogo mesmo assim).
  Só os PNGs usados ficam em `assets/vendor/ninja-adventure/`, com a licença. O zip original não vai para o repositório.
- **Máquinas e construções da fábrica:** feitas por nós, seguindo as cores e o traço do pacote
  (contorno escuro, 2–3 tons por material, cantos arredondados).

## Atlas

- `assets/_tools/build_terrain.py` monta os atlas a partir do pacote; não edite os PNGs de saída à mão.
- Formato: spritesheet do Pixi (hash de frames), importável em Unity/Godot. Cada frame tem 1 px de borda extra.

## Terreno

| Frame | Variantes | Uso |
|---|---|---|
| `grass` | 4 | Campo aberto |
| `dirt` | 4 | Solo exposto, trilhas |
| `sand` | 4 | Margens |
| `water` | 4 (iguais) | Rio e lago |
| `water_ripple` | 4 quadros | Ondinha animada; salpicar em ~1 de cada 7 tiles de água |
| `forest` | 4 | Chão de floresta (grama escura); as árvores são objetos |
| `rock` | 4 | Pedra sobre terra |
| `ore_iron`, `ore_coal`, `ore_copper`, `ore_zinc` | 4 cada | Jazida: pedra com minério sobre terra |
| `clay` | 4 | Barro sobre terra |

Variante escolhida por hash de (x, y).

### Transições (dual grid)

Frames `<a>_<b>_<máscara>`, máscara 0–15: bits dos cantos com o terreno `a`
(1 = NO, 2 = NE, 4 = SO, 8 = SE). Pares: `grass_dirt`, `grass_sand`, `grass_water`, `sand_water`.
Desenhados **deslocados meio tile**: cada tile de transição fica entre 4 células do mapa.

## Objetos do mapa

`assets/objects/objects.png` + `.json`:

- Árvores: `tree_round_0..1`, `tree_pine_0..1` (32×32).
- Construções do pacote: `house_thatch`, `house_flat`, `house_tile` (64×48), `hut_mud`, `hut_straw` (48×48),
  `oven_clay`, `oven_stone` (32×32).
- Animadas (em `animations`): `watermill` (roda d'água, 3 quadros 34×36) e `windmill_blades` (pás do moinho, 4 quadros 64×64).
Âncora no centro da base (`anchor` 0.5, 1.0); ordenar por y da base; sombra no chão desenhada pelo motor.

### Máquinas (`assets/_tools/machines.py`)

Montadas sobre peças do pacote (tronco) para o traço casar;
o que não existe no pacote é desenhado com as cores dele (contorno `#141b1b`, 3 tons por material).

| Frame / animação | Tamanho | Uso |
|---|---|---|
| `shaft_h`, `shaft_v` (4 quadros) | 16×16 | Eixo de tronco com cintas de ferro; o horizontal fica sobre um poste. Emenda com o vizinho |
| `gear_small` (4 quadros) | 16×16 | Engrenagem pequena (8 dentes) |
| `gear_large` (4 quadros) | 32×40 | Engrenagem grande de pé numa armação de madeira, 2×2 |

### Construções da barra (`assets/_tools/references.py`)

Vêm das imagens de referência do usuário. Para importar uma imagem nova (ou trocar uma existente):
`python3 assets/_tools/references.py <imagem> <id>`, com o id de `data/jogo/construcoes.json`. Isso tira o fundo claro,
recorta e guarda `assets/source/<id>.png` numa resolução intermediária. O build tira o tablado da maquete (laterais de terra e grama da base), para o prédio assentar direto no terreno, clareia as cores, reduz para pixel art (Lanczos),
realça o contraste, limita a 32 cores e redesenha o contorno de 1 px.

| Frame | Tamanho | Footprint |
|---|---|---|
| `storage`, `workbench`, `quarry`, `mine`, `lumberjack`, `charcoal_kiln`, `smelter`, `forge` | 74 px de largura | 2×2 |
| `mill` | 74×95 | 2×2 |
| `farm` | 90×63 | 3×3 |

As referências são **isométricas** (base em losango), diferente do terreno e dos outros objetos (3/4 reto).
Âncora no centro de baixo, como os demais; o moinho é parado (as pás não giram).

### Construções giradas

Rotação horária: `_r0` = S (arte original), `_r1` = O, `_r2` = N, `_r3` = L. Nas rotações 1 e 3 o footprint troca
largura e altura. Na vista 3/4 só a parede sul aparece: `_r2` mostra o fundo (sem porta) e `_r1`/`_r3` mostram a
fachada estreita, o telhado mais comprido e a porta no canto do lado para onde ela abre.

| Base | Footprint r0 | Frames |
|---|---|---|
| `house_thatch` | 4×2 | `house_thatch_r1..r3` |
| `hut_straw` | 3×2 | `hut_straw_r1..r3` |
| `oven_stone` | 2×2 | `oven_stone_r1..r3` |
| `watermill` (animação) | 2×2 | animações `watermill_r1..r3` (quadros `watermill_rN_0..2`) |

## Futuro: Unity/Unreal em HD-2D

Na migração, o visual vira HD-2D: os mesmos sprites em pixel art como *billboards* num cenário 3D com
luz dinâmica, bloom e profundidade de campo. Para os sprites de hoje servirem lá:

- **Sem sombra projetada nem luz ambiente embutida** no sprite (o motor desenha a sombra); só o sombreamento do próprio volume.
- **Fundo transparente** e base alinhada na grade, para virar quad em pé no 3D.
- Partes que brilham (fogo, janelas, brasas) em frames ou camadas separadas, para virarem fontes de luz/emissivo.
- Terreno 16×16 vira textura de malhas 3D; manter os tiles emendáveis.
