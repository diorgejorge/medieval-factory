# Frentes de trabalho

Cada frente é pequena e testável. Desde 2026-10-31 a Mecânica sobe cada frente sozinha (PR + CI + merge) e avisa o que mudou.

**Direção (2026-10-31):** o jogo escala da coleta manual para a **automação dos recursos**. Cada frente tira uma ação do jogador:
extratores entregam sozinhos, máquinas puxam insumos, servos e depois esteiras, calhas, eixos e carroças movem tudo,
até as cadeias de produção rodarem sem intervenção. O jogador passa a planejar e expandir, não a carregar itens.

## MVP (M0–M5)

| # | Marco | Frente | Como testar |
|---|---|---|---|
| 1 | M0 | Fundação: Vite + TS strict + Vitest + ESLint/Prettier; grade 256×256 com Pixi, câmera (pan/zoom) e culling por chunk | `docker compose up --build -d`; mapa a ~60 FPS |
| 2 | M0 | Simulação no Web Worker: tick fixo de 30 UPS, protocolo de comandos/snapshots, UPS no HUD | Testes do loop; HUD mostra 30 UPS |
| 3 | M0 | CI no GitHub Actions (lint, typecheck, testes, build) | PR com checks verdes |
| 4 | M1 | Terreno orgânico por seed: RNG determinístico, ruído para relevo, **rio sinuoso, lagos**, florestas e jazidas | Mesma seed → mesmo mapa (teste); mapa com aparência natural |
| 5 | M1 | **Vilarejos vizinhos:** gerados por seed perto de água, ligados por trilhas; clicar abre painel (nome, população, o que produzem e o que pedem) | Vilarejos aparecem em lugares plausíveis; painel abre ao clicar |
| 6 | M1 | Construir: colocar/remover/rotacionar via comandos, prévia fantasma, regras de ocupação | Testes de ocupação; construir no navegador |
| 7 | M2 | Dados em JSON tipado (itens, construções, receitas, era e nível de ferramenta) com validação | Testes de carga/validação |
| 8 | M2 | Extratores e armazém (Era I): pegam ferramenta no armazém, extraem e **entregam sozinhos** no armazém ao alcance | Lenhador com machado de pedra enche o armazém sem o jogador fazer nada |
| 9 | M2 | Máquinas com receitas e combustível que **puxam insumos e devolvem produtos** ao armazém ao alcance; sistemas dormentes | Moinho + forno de pão fazem pão sozinhos a partir do trigo da lavoura |
| 10 | M2 | Servos levando itens entre armazéns distantes (logística inicial, ainda limitada pelo número de servos) | Dois armazéns longe um do outro se abastecem sem cliques |
| 11 | M2 | **Interagir com vilarejos:** trocar itens e recrutar servos (em troca de comida) | Trocar pão por servos ou ferramentas |
| 12 | M2 | Entrada na Era II: carvoaria, fundição, forja, ferramentas de ferro (extratores 2× mais rápidos) | Primeira barra e ferramenta de ferro feitas sem intervenção |
| 13 | M3 | **Esteiras e calhas** entre máquinas (fila por segmento): o primeiro transporte automático sem servos | Cadeia do pão ligada por calhas, sem armazém no meio |
| 14 | M3 | Guincho/nora (subida), divisores e filtros por item; benchmark de 5k itens | 5k itens sem queda de UPS; uma calha separa trigo de pedra |
| 15 | M4 | Rede de eixos (union-find), roda d'água, alcance/perda | Testes da rede de torque |
| 16 | M4 | Moinho de vento, máquinas dependentes de torque (mais rápidas que as manuais), overlay de torque | Moinho/forja param sem torque |
| 17 | M4 | **Carroças e estradas** com rotas automáticas entre armazéns e vilarejos | Carroça leva pão a um vilarejo e volta com lã, em loop |
| 18 | M5 | Ciclos e desafios + 1º desafio de engenharia: canalizar água do rio até a fonte da cidade | Cumprir o desafio dentro do ciclo; falhar reduz o favor do rei |
| 19 | M5 | 2º desafio: benfeitoria na cidade principal (poço ou celeiro); alternância de tipos | Ciclo seguinte traz um desafio de outro tipo |
| 20 | M5 | Salvar/carregar (IndexedDB + gzip) | Salvar, recarregar a página, carregar |

## Depois do MVP (a detalhar em frentes quando chegarmos lá)

- **M6:** guildas e manuscritos (pesquisa).
- **M7:** carroças/estradas entre vilarejos, comida e casas para servos.
- **M8:** combate pontual como desafio de ciclo (lobo alfa, bandoleiro); vilarejos pedindo proteção.
- **M9:** Era III (carvão mineral, aço, altos-fornos) e estações do ano.
- **M10:** Era IV, vapor steampunk (caldeiras, tubulações, autômatos) e desafios da era (torre do relógio, autômato rebelde).
- **M11:** canais, saqueadores opcionais, polimento, áudio.
