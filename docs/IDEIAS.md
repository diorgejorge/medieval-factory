# Ideias de design (independentes de engine)

Este protótipo web serve para validar o loop do jogo. A versão final deve migrar para **Unreal Engine ou Unity**,
então tudo o que é design fica registrado aqui e em `data/` (JSON), não preso ao código TypeScript.

## O que deve sobreviver à migração

| Artefato | Onde fica | Como reaproveitar |
|---|---|---|
| Ideias e regras de design | `docs/IDEIAS.md`, `docs/PLANO.md` | Referência direta |
| Itens, receitas, construções, eras, desafios | `data/*.json` (a partir da Frente 7) | Importar como DataTables (Unreal) ou ScriptableObjects (Unity) |
| Fórmulas da simulação (torque, calhas, combustível) | `src/core/` + testes | Testes servem de especificação executável para reescrever em C++/C# |
| Balanceamento | Valores nos JSON | Sem mudança |

Regra: **nenhum número de balanceamento no código**. Se é regra de jogo, vai para JSON ou para esta página.

## Ideias registradas

### Mundo
- Mapa gerado por seed com aparência orgânica: rio sinuoso, lagos, florestas, colinas, jazidas.
- **Vilarejos vizinhos** perto da água, ligados por trilhas. Ao clicar: nome, população, o que produzem e o que pedem.
- Interação com vilarejos: trocar itens, recrutar servos em troca de comida; mais tarde, pedir proteção (combate).

### Progressão por eras
- **I. Madeira:** ferramentas de madeira/pedra, lenha, força humana/animal, roda d'água.
- **II. Ferro:** ferramentas de ferro, carvão vegetal, moinho de vento, fole a torque.
- **III. Carvão:** aço, carvão mineral/coque, altos-fornos.
- **IV. Vapor (steampunk):** latão, engrenagens, caldeiras, pistões, tubulações, autômatos.
- Ferramentas são itens que se gastam; o nível define velocidade e o que pode ser extraído.
- Combustível tem densidade: lenha < carvão vegetal < carvão mineral < vapor.

### Ciclos e desafios do rei
- Cada ciclo traz um desafio; tipos alternam e escalam com a era.
- **Engenharia:** canalizar água até a fonte da cidade, drenar pântano, erguer ponte.
- **Benfeitoria na cidade principal:** poço, celeiro, muralha, catedral, torre do relógio a vapor.
- **Combate:** lobo alfa, bandoleiro, cavaleiro rival, autômato rebelde.
- **Produção:** entregar N itens até o prazo.
- Falhar custa favor do rei (penalidade leve), não é game over.

### Mecânicas físicas
- Rede de eixos com alcance limitado e perda por distância.
- Calhas só descem; subir exige guincho/nora movidos a torque.
- Vapor leva força mais longe que eixos, mas consome água e combustível sem parar.
- Estações: inverno congela rodas d'água, verão reduz vazão.

### Pessoas
- Servos carregam itens, operam máquinas manuais, comem e precisam de casa.
