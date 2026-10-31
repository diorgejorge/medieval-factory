/** Uma construção da rede de eixos: fonte (supply), consumidora (need) ou só ligação (engrenagem). */
export interface PowerPart {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Força que a fonte gera (roda d'água, moinho de vento). */
  supply: number;
  /** Força que a máquina precisa para trabalhar mais rápido. */
  need: number;
}

/** Uma rede: tudo o que se toca pelos lados, somado. */
export interface PowerNetwork {
  supply: number;
  demand: number;
  /** Força bastante para todas as máquinas da rede (rede sem máquina não está ligada). */
  powered: boolean;
}

/**
 * Agrupa as peças em redes com union-find: duas peças se ligam quando os terrenos encostam
 * por um lado (não pela diagonal). Devolve a rede de cada peça, por id.
 */
export function buildNetworks(parts: readonly PowerPart[]): Map<number, PowerNetwork> {
  const parent = parts.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      const up = parent[i] ?? i;
      parent[i] = parent[up] ?? up;
      i = up;
    }
    return i;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  const owner = new Map<string, number>();
  parts.forEach((part, index) => {
    for (let y = part.y; y < part.y + part.height; y++) {
      for (let x = part.x; x < part.x + part.width; x++) owner.set(`${x},${y}`, index);
    }
  });
  parts.forEach((part, index) => {
    // Basta olhar à direita e embaixo de cada tile: o outro lado é visto pela outra peça.
    for (let y = part.y; y < part.y + part.height; y++) {
      for (let x = part.x; x < part.x + part.width; x++) {
        for (const key of [`${x + 1},${y}`, `${x},${y + 1}`]) {
          const other = owner.get(key);
          if (other !== undefined && other !== index) union(index, other);
        }
      }
    }
  });

  const totals = new Map<number, PowerNetwork>();
  parts.forEach((part, index) => {
    const root = find(index);
    const network = totals.get(root) ?? { supply: 0, demand: 0, powered: false };
    network.supply += part.supply;
    network.demand += part.need;
    totals.set(root, network);
  });
  for (const network of totals.values()) network.powered = network.demand > 0 && network.supply >= network.demand;
  return new Map(parts.map((part, index) => [part.id, totals.get(find(index)) ?? { supply: 0, demand: 0, powered: false }]));
}
