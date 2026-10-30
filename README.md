# Medieval Factory

Jogo de automação/fábrica com tema medieval para o navegador.

Plano de design, arquitetura e roadmap: [docs/PLANO.md](docs/PLANO.md).
Frentes de trabalho: [docs/FRENTES.md](docs/FRENTES.md).

## Rodando (só precisa de Docker)

```bash
docker compose up --build -d
```

A imagem roda lint, typecheck e testes antes do build; se algo falhar, ela não é criada.
O jogo fica em http://localhost:5173. Para derrubar e apagar tudo:

```bash
docker compose down --rmi all
```

Controles: arrastar com o mouse ou WASD/setas para mover; roda do mouse para zoom;
espaço pausa a simulação; 1, 2 e 3 mudam a velocidade (1x, 2x, 4x).

## Rodando com Node.js local (opcional)

```bash
npm install
npm run dev      # servidor com hot reload
npm test         # testes (Vitest)
npm run lint     # ESLint
npm run build    # typecheck + build de produção
```
