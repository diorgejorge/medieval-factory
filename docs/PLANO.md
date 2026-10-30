# Medieval Factory — Plano do jogo

> Jogo de automação/fábrica com tema medieval, rodando no navegador.
> Inspirado no gênero "factory builder", com mecânicas próprias, não é recriação de nenhum jogo existente.

## 1. Visão

Você chega a uma vila abandonada com um punhado de servos e uma carta do rei. Precisa transformar a vila em um centro produtor
capaz de cumprir os **decretos reais** (metas), usando a força da água, do vento, dos animais e, nas eras finais, do **vapor**. Não há eletricidade nem esteiras
mágicas: tudo depende de **energia mecânica**, **gravidade**, **terreno** e **pessoas**.

**Pilares**
1. **Física medieval como restrição criativa:** energia e transporte têm limites físicos que geram puzzles de layout.
2. **Terreno importa:** relevo e rios definem onde construir, não são só decoração.
3. **Pessoas são parte da máquina:** servos precisam de comida e abrigo; a logística humana é um recurso.
4. **Escala crescente:** de uma oficina manual a um vale industrializado.
5. **Progressão natural:** madeira antes do metal, lenha antes do carvão, carvão antes do vapor (seção 2.1).
6. **Cada ciclo, um desafio:** o rei sempre pede algo concreto e variado (seção 2.2).

## 2. Mecânicas principais (o que nos diferencia)

| Mecânica | Como funciona | Por que é interessante |
|---|---|---|
| **Rede de eixos (torque)** | Rodas d'água, moinhos de vento e esteiras de bois geram torque. Eixos e engrenagens o transmitem com **alcance limitado e perda por distância**. | Força a construir "distritos" ao redor das fontes de energia em vez de uma rede infinita. |
| **Calhas por gravidade** | Transporte barato e rápido, mas **só desce** o relevo. Subir exige guinchos/noras movidos a torque. | Puzzle de layout que usa a altura do terreno. |
| **Carroças e estradas** | Logística de média distância. Rotas com paradas, capacidade e animais que comem. | Substitui trens em escala menor; cria economia de comida. |
| **Canais e barcaças** | Logística de longa distância e alto volume, cavando canais ligados a rios. | Late game; transforma o mapa. |
| **Servos** | Carregam itens à mão (logística inicial), operam máquinas manuais. Consomem comida e precisam de casas. | Early game sem automação; depois viram custo de manutenção. |
| **Estações do ano** | Inverno congela rodas d'água, verão reduz a vazão dos rios, outono é colheita. Ciclo de ~20 min. | Exige estoques e fontes de energia redundantes. |
| **Guildas (árvore de tecnologia)** | Pesquisa com **manuscritos** produzidos em scriptórios (pergaminho + tinta). Cada guilda (Ferreiros, Pedreiros, Tecelões, Moleiros...) libera um ramo. | Pesquisa vira uma cadeia produtiva, não só um timer. |
| **Decretos reais** | O desafio de cada ciclo (seção 2.2), com prazo. Recompensas: terras, títulos, novas receitas. | Dá objetivos claros e ritmo; substitui a ameaça constante de inimigos. |
| **Inimigos** | Alguns ciclos trazem um inimigo específico a derrotar (lobo alfa, bandoleiro, cavaleiro rival, autômato rebelde). Ataques aleatórios de saqueadores ficam como modo opcional. | Combate pontual e planejado como desafio, sem pressão constante. |

### Exemplos de cadeias produtivas

- **Comida:** trigo → moinho (torque) → farinha → padaria (lenha) → pão
- **Ferro:** minério de ferro + carvão vegetal → forno de fundição → ferro bruto → forja (fole a torque) → barras → ferramentas/armas
- **Carvão vegetal:** madeira → carvoaria → carvão
- **Têxtil:** ovelhas → lã → roca → fio → tear → tecido
- **Construção:** argila → olaria → tijolos; pedra → pedreira → blocos
- **Pesquisa:** pele → curtume → pergaminho; galhas + ferro → tinta; pergaminho + tinta → manuscrito
- **Vidro (late):** areia + cinza de potássio → forno de vidro → vidro → vitrais (decreto da catedral)

### 2.1 Progressão por eras

Cada era melhora **ferramentas** e **combustível**. O que vem antes continua útil, só fica mais lento ou menos denso.

| Era | Ferramentas | Combustível e energia | Passagem para a próxima |
|---|---|---|---|
| **I. Madeira** | Madeira e pedra (machado de pedra, pá de madeira) | **Lenha**; força humana e animal; roda d'água | Fundir o primeiro ferro e forjar uma ferramenta de metal |
| **II. Ferro** | Ferro (mais rápidas; liberam mina profunda) | **Carvão vegetal**; moinho de vento; fole a torque | Extrair carvão mineral |
| **III. Carvão** | Aço | **Carvão mineral/coque**; altos-fornos | Construir a primeira caldeira |
| **IV. Vapor (steampunk)** | Latão, engrenagens, autômatos | **Vapor**: caldeiras, pistões e tubulações | Fim de jogo: grandes obras do reino |

- **Ferramentas são itens.** Servos e extratores usam (e gastam) ferramentas; o nível da ferramenta define a velocidade e o que pode ser extraído.
- **Combustível tem densidade.** Lenha < carvão vegetal < carvão mineral < vapor; fornos de eras novas exigem o combustível da era.
- **Vapor amplia a rede de energia:** tubulações levam força mais longe que eixos, mas consomem água e combustível sem parar.

### 2.2 Ciclos e desafios

O jogo avança em **ciclos** (no MVP, um período fixo de tempo; depois, um ano com estações). Cada ciclo traz **um desafio do rei**,
alternando tipos para não repetir o mesmo em ciclos seguidos, e escalando com a era.

| Tipo | Exemplos |
|---|---|
| **Engenharia** | Canalizar água do rio até a fonte da cidade (calhas + nora); drenar um pântano; erguer uma ponte |
| **Benfeitoria na cidade principal** | Poço, celeiro, muralha, catedral; na era do vapor, uma torre do relógio a vapor |
| **Combate** | Derrotar o lobo alfa, o bando de um bandoleiro, um cavaleiro rival, um autômato rebelde |
| **Produção** | Entregar N itens (ex.: "200 espadas antes do inverno") |

Cumprir dá recompensas (terras, títulos, receitas); falhar custa **favor do rei** (penalidade leve), não é game over.

## 3. Escopo do MVP

O MVP prova que o loop central é divertido e cobre a **Era I e a entrada na Era II**. **Fora do MVP:** multiplayer, combate, saqueadores, canais, estações, eras III e IV.

1. Mapa 2D top-down em grade, gerado por seed (relevo, rio, recursos).
2. Colocar, rotacionar e remover construções.
3. 4 recursos: madeira, pedra, minério de ferro, trigo.
4. 8 a 10 construções: lenhador, pedreira, mina, fazenda, moinho, forno, forja, roda d'água, eixo, calha, depósito.
5. Rede de eixos (torque) e calhas por gravidade funcionando.
6. 2 cadeias completas (pão com lenha; barras de ferro com carvão vegetal), com ferramentas de madeira → ferro.
7. Ciclos com 2 desafios: canalizar água até a cidade e uma benfeitoria (poço ou celeiro).
8. Salvar/carregar local.

## 4. Stack técnica

| Camada | Escolha | Motivo |
|---|---|---|
| Linguagem | **TypeScript** (strict) | Tipos ajudam em simulações grandes; zero custo em runtime. |
| Build | **Vite** | Dev server rápido, suporte nativo a Web Workers. |
| Render | **PixiJS v8** (WebGL, WebGPU quando disponível) | Batching de sprites muito eficiente; mais leve que Phaser porque não precisamos de física/cenas. |
| UI (HUD/menus) | **Solid.js** ou DOM puro | Reatividade fina sem virtual DOM; a UI não pode competir com o render. Evitar React aqui. |
| Simulação | **Web Worker** dedicado | Tira a lógica da main thread; render fica liso mesmo com fábrica grande. |
| Dados | Receitas/construções em **JSON tipado** | Balanceamento sem mexer em código; facilita mods no futuro. |
| Save | **IndexedDB** + `CompressionStream` (gzip) | Saves grandes sem travar; nativo do navegador. |
| Testes | **Vitest** | Mesmo pipeline do Vite; simulação pura é 100% testável. |
| Qualidade | ESLint + Prettier + CI no GitHub Actions | Padrão de clean code automatizado. |

**Alternativa considerada:** simulação em **Rust → WASM**. Mais rápida, mas complica tooling e debug. Recomendação:
começar em TS com dados em typed arrays; só migrar o núcleo para WASM se o profiling mostrar gargalo real.

## 5. Arquitetura

```
src/
  core/        # Simulação pura: sem DOM, sem Pixi. Roda no Worker.
    world/     # Grade, chunks, terreno
    ecs/       # Componentes em typed arrays (SoA) e sistemas
    systems/   # power, transport, production, workers, decrees
    data/      # Tipos e carregamento de receitas/construções
  render/      # PixiJS: lê snapshots da simulação, nunca escreve nela
  ui/          # HUD, menus, painéis (Solid)
  input/       # Mouse/teclado → comandos
  bridge/      # Protocolo Worker ↔ main (comandos e snapshots)
  io/          # Save/load, IndexedDB
data/          # JSON de receitas, itens, construções
tests/
```

**Regras de dependência**
- `core` não importa nada de `render`, `ui` ou `input`.
- A main thread só fala com a simulação por **comandos** (`PlaceBuilding`, `Rotate`, `Remove`...). Isso facilita replay, undo e multiplayer no futuro.
- A simulação publica **snapshots/deltas** por tick; o render interpola entre eles.

**Loop**
- Simulação em **tick fixo de 30 UPS** (determinístico: inteiros/ponto fixo, RNG com seed).
- Render a 60+ FPS com interpolação.

## 6. Performance (decisões desde o início)

1. **Itens em calhas não são entidades.** Cada segmento de calha é uma fila com distâncias entre itens; só a frente se move de verdade. Custo O(segmentos), não O(itens).
2. **ECS com Structure of Arrays** (`Float32Array`/`Uint32Array`): cache-friendly, zero alocação por tick.
3. **Sistemas dormentes:** máquina sem insumo ou com saída cheia sai da lista ativa até um evento acordá-la.
4. **Redes de torque recalculadas só quando mudam** (union-find ao colocar/remover); no tick é só leitura de valor.
5. **Chunks 32×32:** culling no render, simulação simplificada para chunks fora da tela quando possível.
6. **Transferência barata entre threads:** `ArrayBuffer` transferível por tick; `SharedArrayBuffer` se o host suportar COOP/COEP.
7. **Sprites em atlas** e batching do Pixi; zero `new` no loop quente.
8. **Orçamento:** 16 ms por frame na main thread; meta de 10k construções ativas a 30 UPS em hardware médio.
9. **Benchmarks no CI** para os sistemas críticos (transport, power, production), evitando regressões.

## 7. Clean code (convenções)

- Funções pequenas com um único propósito; nomes descritivos (`advanceChuteSegment`, não `upd`).
- Sistemas são funções puras sobre o estado do mundo: `(world, dt) => void`.
- Nada de números mágicos: constantes nomeadas em `core/config.ts`.
- Dados de jogo fora do código (JSON); código não conhece "trigo", conhece `ItemId`.
- Testes para cada sistema da simulação antes de ligar o render.
- Comentários explicam **por quê**, não o quê.

## 8. Roadmap

| Marco | Entrega | Critério de pronto |
|---|---|---|
| **M0: Fundação** | Vite + TS + Pixi + Worker + CI; grade com câmera (pan/zoom) | Mapa 256×256 a 60 FPS |
| **M1: Construir** | Colocar/remover/rotacionar; geração de terreno por seed | Mesma seed → mesmo mapa |
| **M2: Produzir** | Extratores, depósitos, receitas em JSON, servos carregando itens | Cadeia do pão manual funciona |
| **M3: Transportar** | Calhas por gravidade e guincho | 5k itens em movimento sem queda de UPS |
| **M4: Energia** | Roda d'água, moinho de vento, eixos com alcance/perda | Moinho e forja dependem de torque |
| **M5: Objetivo** | Ciclos e desafios (canalizar água, benfeitoria) + salvar/carregar | **MVP jogável** |
| M6 | Guildas e manuscritos (pesquisa) | Árvore com 3 guildas |
| M7 | Carroças/estradas, comida e casas para servos | |
| M8 | Combate pontual: desafio de inimigo (lobo alfa, bandoleiro) | Derrotar um inimigo cumpre o ciclo |
| M9 | Era III (carvão mineral, aço, altos-fornos) e estações do ano | |
| M10 | Era IV: vapor steampunk (caldeiras, tubulações, autômatos) | Fábrica movida a vapor |
| M11 | Canais, saqueadores opcionais, polimento, áudio | |

## 9. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Performance do JS com fábricas grandes | Decisões da seção 6 desde o M0; benchmarks no CI; WASM como plano B. |
| Arte consome muito tempo | Top-down ortogonal (não isométrico) com tiles 32 px; placeholders até o M5. |
| Escopo cresce demais | MVP fechado (seção 3); cada mecânica nova só após o loop central estar divertido. |
| Mecânicas físicas frustrantes | Visualização clara (overlay de torque e de relevo) e playtest a cada marco. |

## 10. Decisões em aberto

- Visual: pixel art ou vetorial simples?
- Saqueadores aleatórios: modo opcional ou cortar de vez? (o combate pontual dos desafios fica)
- Duração de um ciclo no MVP (proposta: 15 min)?
- Hospedagem: GitHub Pages (simples) ou Cloudflare Pages (permite headers COOP/COEP para `SharedArrayBuffer`)?
