import { describe, expect, it } from 'vitest';
import { TICKS_PER_SECOND } from '../src/core/config';
import { GAME_DATA } from '../src/core/data/data';
import { Economy } from '../src/core/economy/economy';
import { ITEM_SPACING, Segment, TransportNetwork, type Receiver } from '../src/core/economy/transport';
import { BuildingSite, type Rotation } from '../src/core/world/buildings';
import { Grid } from '../src/core/world/grid';

const BELT = { speed: 2, gravity: false };
const CHUTE = { speed: 2, gravity: true };

function ticks(network: TransportNetwork, seconds: number, deliver: Receiver = () => false): void {
  for (let i = 0; i < Math.round(seconds * TICKS_PER_SECOND); i++) network.step(deliver);
}

/** Linha reta de `length` tiles para leste a partir de (0, 0). */
function line(grid: Grid, length: number, def = BELT): TransportNetwork {
  const network = new TransportNetwork(grid);
  network.rebuild(Array.from({ length }, (_, x) => new Segment(x + 1, x, 0, 3 as Rotation, def)));
  return network;
}

describe('calhas e esteiras', () => {
  it('o item anda na velocidade da esteira e passa de tile em tile', () => {
    const network = line(new Grid(10), 3);
    network.at(0, 0)?.push('wood');
    ticks(network, 1.25);
    expect(network.at(0, 0)?.items).toEqual([]);
    // 2 tiles/s por 1,25 s = 2,5 tiles, menos até um tick perdido em cada passagem de tile.
    const t = network.at(2, 0)?.items[0]?.t ?? -1;
    expect(t).toBeGreaterThan(0.3);
    expect(t).toBeLessThanOrEqual(0.5 + 1e-9);
  });

  it('no fim da linha sem destino, os itens param em fila com espaçamento', () => {
    const network = line(new Grid(10), 1);
    const segment = network.at(0, 0);
    for (let i = 0; i < 6; i++) {
      segment?.push('stone');
      ticks(network, 0.5);
    }
    const positions = segment?.items.map((i) => i.t) ?? [];
    expect(positions.length).toBe(1 / ITEM_SPACING + 1);
    expect(positions[0]).toBe(1);
    for (let i = 1; i < positions.length; i++) {
      expect((positions[i - 1] ?? 0) - (positions[i] ?? 0)).toBeGreaterThanOrEqual(ITEM_SPACING - 1e-9);
    }
  });

  it('entrega para quem estiver no fim da linha', () => {
    const network = line(new Grid(10), 2);
    const received: string[] = [];
    network.at(0, 0)?.push('wheat');
    ticks(network, 2, () => {
      received.push('wheat');
      return true;
    });
    expect(received).toEqual(['wheat']);
  });

  it('a calha não sobe: para diante de um tile mais alto', () => {
    const grid = new Grid(10);
    grid.setHeight(1, 0, 50);
    const network = line(grid, 2, CHUTE);
    network.at(0, 0)?.push('wood');
    ticks(network, 2);
    expect(network.at(0, 0)?.items[0]?.t).toBe(1);
    expect(network.at(1, 0)?.items).toEqual([]);
  });

  it('linha comprida (5000 tiles) não estoura a pilha ao ordenar', () => {
    expect(() => line(new Grid(5000), 5000)).not.toThrow();
  });
});

describe('máquinas ligadas por esteira', () => {
  it('lavoura → esteira → moinho → esteira → armazém, sem servos', () => {
    const grid = new Grid(40);
    const site = new BuildingSite(grid);
    // Sem armazém ao alcance: tudo tem de passar pelas esteiras.
    const economy = new Economy(grid, { x: 39, y: 39 }, { capacity: 50, servants: 0, stock: [] });
    site.place('farm', 0, 0, 0); // 4×4 em (0..3, 0..3)
    for (let x = 4; x <= 6; x++) site.place('belt', x, 1, 3); // leste até o moinho
    site.place('mill', 7, 0, 0); // 4×4 em (7..10, 0..3)
    for (let x = 11; x <= 12; x++) site.place('belt', x, 1, 3);
    site.place('storage', 13, 0, 0); // 4×4 em (13..16, 0..3)
    economy.sync(site);

    const farmSeconds = GAME_DATA.buildings.get('farm')?.extracts?.seconds ?? 0;
    for (let i = 0; i < (farmSeconds * 2 + 15) * TICKS_PER_SECOND; i++) economy.step();
    const snapshot = economy.snapshot();
    expect(snapshot.stock['flour']).toBe(1);
    expect(snapshot.segments.length).toBe(5);
  });
});

describe('nora, repartidor e separador', () => {
  const SPLIT = { speed: 2, gravity: false, sort: 'split' as const };
  const FILTER = { speed: 2, gravity: false, sort: 'filter' as const };

  /** Um segmento em (2, 2) virado para leste, com esteiras saindo para leste, sul e norte. */
  function junction(def: typeof SPLIT | typeof FILTER) {
    const grid = new Grid(5);
    const network = new TransportNetwork(grid);
    network.rebuild([
      new Segment(1, 2, 2, 3, def),
      new Segment(2, 3, 2, 3, BELT), // em frente
      new Segment(3, 2, 3, 0, BELT), // direita (sul)
      new Segment(4, 2, 1, 2, BELT), // esquerda (norte)
    ]);
    const received: Record<string, string[]> = { ahead: [], right: [], left: [] };
    const deliver = (x: number, y: number, item: string) => {
      const side = x === 4 ? 'ahead' : y === 4 ? 'right' : y === 0 ? 'left' : null;
      if (side) received[side]?.push(item);
      return side !== null;
    };
    return { network, received, deliver };
  }

  function feed(network: TransportNetwork, deliver: Receiver, items: string[]): void {
    for (const item of items) {
      network.at(2, 2)?.push(item);
      ticks(network, 0.5, deliver);
    }
    ticks(network, 3, deliver);
  }

  it('a esteira sobe pouco; a nora sobe o relevo', () => {
    const belt = { speed: 2, gravity: false, climb: 2 };
    const hoist = { speed: 2, gravity: false, climb: 255 };
    for (const [def, rise, passes] of [
      [belt, 2, true],
      [belt, 3, false],
      [hoist, 120, true],
    ] as const) {
      const grid = new Grid(10);
      grid.setHeight(1, 0, rise);
      const network = line(grid, 2, def);
      network.at(0, 0)?.push('wood');
      ticks(network, 2);
      expect(network.at(1, 0)?.items.length, `subida ${rise}`).toBe(passes ? 1 : 0);
    }
  });

  it('o repartidor divide por igual entre frente e lados', () => {
    const { network, received, deliver } = junction(SPLIT);
    feed(network, deliver, Array.from({ length: 9 }, () => 'wood'));
    expect([received['ahead']?.length, received['right']?.length, received['left']?.length]).toEqual([3, 3, 3]);
  });

  it('o separador manda o trigo em frente e a pedra para os lados', () => {
    const { network, received, deliver } = junction(FILTER);
    expect(network.setFilter(1, 'wheat')).toBe(true);
    feed(network, deliver, ['stone', 'wheat', 'stone', 'wheat', 'stone']);
    expect(received['ahead']).toEqual(['wheat', 'wheat']);
    expect([...(received['right'] ?? []), ...(received['left'] ?? [])]).toEqual(['stone', 'stone', 'stone']);
  });

  it('sem escolha, o separador fica com o primeiro item que chegar', () => {
    const { network, received, deliver } = junction(FILTER);
    feed(network, deliver, ['iron_ore', 'wood', 'iron_ore']);
    expect(received['ahead']).toEqual(['iron_ore', 'iron_ore']);
    expect(network.at(2, 2)?.view().filter).toBe('iron_ore');
  });

  it('não devolve item para a esteira que alimenta o repartidor', () => {
    const grid = new Grid(5);
    const network = new TransportNetwork(grid);
    network.rebuild([
      new Segment(1, 2, 2, 3, SPLIT),
      new Segment(2, 2, 3, 2, BELT), // entra pelo sul, apontando para o repartidor
    ]);
    network.at(2, 2)?.push('wood');
    ticks(network, 2, () => false);
    expect(network.at(2, 3)?.items).toEqual([]);
    expect(network.at(2, 2)?.items.length).toBe(1);
  });

  it('os dados trazem nora, repartidor e separador', () => {
    expect(GAME_DATA.buildings.get('hoist')?.transport?.climb).toBeGreaterThan(GAME_DATA.buildings.get('belt')?.transport?.climb ?? 0);
    expect(GAME_DATA.buildings.get('splitter')?.transport?.sort).toBe('split');
    expect(GAME_DATA.buildings.get('filter')?.transport?.sort).toBe('filter');
  });
});

describe('separador no painel', () => {
  it('o snapshot mostra o item escolhido e o comando troca a escolha', () => {
    const grid = new Grid(20);
    const site = new BuildingSite(grid);
    const economy = new Economy(grid, { x: 19, y: 19 }, { capacity: 10, servants: 0, stock: [] });
    const filter = site.place('filter', 2, 2, 3);
    economy.sync(site);
    const id = filter?.id ?? -1;
    expect(economy.snapshot().buildings[id]?.filter).toBeNull();
    expect(economy.setFilter(id, 'wheat')).toBe(true);
    expect(economy.snapshot().buildings[id]?.filter).toBe('wheat');
  });
});
