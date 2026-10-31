import { describe, expect, it } from 'vitest';
import { TICKS_PER_SECOND } from '../src/core/config';
import { GAME_DATA } from '../src/core/data/data';
import { Economy } from '../src/core/economy/economy';
import { ITEM_SPACING, Segment, TransportNetwork } from '../src/core/economy/transport';
import { BuildingSite, type Rotation } from '../src/core/world/buildings';
import { Grid } from '../src/core/world/grid';

const BELT = { speed: 2, gravity: false };
const CHUTE = { speed: 2, gravity: true };

function ticks(network: TransportNetwork, seconds: number, deliver = () => false): void {
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
