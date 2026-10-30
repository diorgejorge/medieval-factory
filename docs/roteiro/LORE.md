# Roteiro: reino, personagens e tom

> Texto de referência para o roteiro. Os textos que aparecem na tela ficam em `data/texto/pt-BR/*.json`.

## Tom

- **Leve e irônico, nunca sombrio.** A burocracia do reino é o "vilão" mais frequente: cartas vaidosas, prazos absurdos, selos demais.
- **O jogador é competente; o mundo é que é teimoso.** Falhas são tratadas com humor seco, não com punição moral.
- **Frases curtas.** Uma carta do rei cabe em 3 linhas na tela. Lore longa fica em documentos opcionais, nunca bloqueia o jogo.
- **Medieval sem arcaísmo forçado.** Pode "vossa senhoria" e "por ordem de Sua Majestade"; não pode "vós fizestes" em todo texto.

## O reino de Alvermarca

Reino pequeno, úmido e orgulhoso, cortado pelo **rio Lento**. A capital, **Coroa-d'Água**, fica rio abaixo e depende
das vilas do vale para comer, beber e se exibir para os reinos vizinhos.

O vale de **Vau das Pedras** foi abandonado depois de uma enchente que levou a ponte e o moleiro. O rei decide repovoá-lo
e manda para lá alguém de pouca fama e muita disposição: **o jogador**.

## Arco por era

| Era | Momento da história | Gancho |
|---|---|---|
| **I. Madeira** | Chegada à vila abandonada com servos e uma carta do rei. | Provar que o vale ainda presta. |
| **II. Ferro** | A primeira barra de ferro chama atenção da corte e da Guilda dos Ferreiros. | O rei passa a pedir obras, não só comida. |
| **III. Carvão** | Reinos vizinhos se armam; Alvermarca precisa de aço. Surge o cavaleiro rival. | O vale vira peça política. |
| **IV. Vapor** | Um relojoeiro excêntrico promete "força sem rio nem vento". | A modernidade chega, com chaminés e um autômato que não obedece. |

**Final (fim da Era IV):** a torre do relógio de Coroa-d'Água bate pela primeira vez, movida a vapor do vale.
O rei, pela primeira vez, agradece sem pedir mais nada. (Por uma semana.)

## Personagens

| Personagem | Papel no jogo | Jeito |
|---|---|---|
| **Rei Osmundo III, o Paciente** | Envia os decretos (desafios do ciclo). | Vaidoso, generoso quando satisfeito, impaciente apesar do apelido. Assina tudo com três selos. |
| **Arauto Tibério Cunha** | Entrega as cartas e lembra os prazos (avisos de HUD). | Cansado, leal, comenta o clima e o próprio cavalo. |
| **Irmã Benedita** | Escriba do scriptório; voz da pesquisa e das guildas. | Curiosa, prática, mais engenheira que freira. |
| **Mestra Ilda Braga** | Chefe da Guilda dos Ferreiros; destrava a Era II/III. | Direta, mede pessoas pela qualidade das ferramentas. |
| **Sir Gualdim de Montefrio** | Cavaleiro rival (desafio de combate, Era III). | Nobre, arrogante, perde com estilo e volta no ciclo seguinte. |
| **Mestre Anselmo Corvo** | Relojoeiro; apresenta o vapor (Era IV). | Genial, distraído, chama máquinas pelo nome. |
| **O Badalo** | Autômato rebelde (desafio de combate, Era IV). | Primeiro autômato de Corvo; "rebelde" porque só obedece ao sino da torre. |
| **Rufo Mão-Torta** | Bandoleiro (desafio de combate, Era II). | Ladrão de estrada mais vaidoso que perigoso. |
| **O Cinzento** | Lobo alfa (desafio de combate, Era I/II). | Não fala. É um lobo. |

## Vilarejos vizinhos

Gerados por seed perto da água. Cada vilarejo tem um **temperamento** (define falas e preços) e um **nome** montado a
partir de prefixo + sufixo (ver `data/texto/pt-BR/vilarejos.json`). Temperamentos: **acolhedor**, **desconfiado**,
**mercador**, **devoto**, **orgulhoso**.

## Regras para escrever textos

1. Texto de tela vai para JSON, nunca para o código.
2. Valores variáveis usam placeholders `{nome}` (ex.: `{quantidade}`, `{item}`, `{prazo}`, `{vilarejo}`). O código troca pelo valor; placeholder desconhecido fica visível (ex.: `{xyz}`) para o erro aparecer.
   Os números vêm de `data/desafios.json` (mecânica), que usa o mesmo `id` do decreto. Texto nunca tem número de balanceamento.
3. IDs em `kebab-case`, estáveis; mudar o texto nunca muda o ID.
4. Cada decreto tem: título, carta (até ~200 caracteres), lembrete, sucesso e falha.
