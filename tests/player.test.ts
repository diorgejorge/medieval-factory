import { describe, expect, it } from 'vitest';
import { Player, PLAYER_SPEED } from '../src/core/player';
import { Grid } from '../src/core/world/grid';
import { Terrain } from '../src/core/world/terrain';

describe('camponês do jogador', () => {
  it('anda na velocidade certa, também na diagonal', () => {
    const player = new Player(5.5, 5.5, new Grid(20), () => false);
    player.move(1, 0, 1);
    expect(player.x).toBeCloseTo(5.5 + PLAYER_SPEED);
    const diagonal = new Player(5.5, 5.5, new Grid(20), () => false);
    diagonal.move(1, 1, 0.5);
    expect(Math.hypot(diagonal.x - 5.5, diagonal.y - 5.5)).toBeCloseTo(PLAYER_SPEED * 0.5);
  });

  it('não entra na água nem em construção, e desliza pelo eixo livre', () => {
    const grid = new Grid(20);
    for (let y = 0; y < 20; y++) grid.setTerrain(8, y, Terrain.Water);
    const player = new Player(6.5, 5.5, grid, (x, y) => x === 7 && y === 7);
    player.move(1, 0, 2);
    expect(player.x).toBeLessThan(8);
    player.move(0, 1, 1);
    expect(player.y).toBeLessThan(7);
    player.move(1, -1, 0.1);
    expect(player.y).toBeLessThan(6.5);
  });

  it('não sai do mapa', () => {
    const player = new Player(0.5, 0.5, new Grid(10), () => false);
    player.move(-1, -1, 1);
    expect(player.x).toBeGreaterThanOrEqual(0.3);
    expect(player.y).toBeGreaterThanOrEqual(0.3);
  });
});

describe('colheita à mão', () => {
  it('colhe da floresta para as mãos, um item por vez, e larga no armazém', async () => {
    const { Economy, HAND_CAPACITY } = await import('../src/core/economy/economy');
    const grid = new Grid(20);
    grid.setTerrain(3, 3, Terrain.Forest);
    grid.setTerrain(4, 4, Terrain.Rock);
    const economy = new Economy(grid, { x: 10, y: 10 }, { capacity: 50, servants: 0, stock: [] });
    expect(economy.gatherByHand(3, 3)).toBe('wood');
    expect(economy.gatherByHand(4, 4)).toBeNull(); // mãos ocupadas com madeira
    expect(economy.gatherByHand(5, 5)).toBeNull(); // grama: nada para colher
    for (let i = 0; i < HAND_CAPACITY + 3; i++) economy.gatherByHand(3, 3);
    expect(economy.snapshot().hand).toEqual({ item: 'wood', amount: HAND_CAPACITY });
    expect(economy.depositHand(0)).toBe(HAND_CAPACITY);
    expect(economy.snapshot().stock['wood']).toBe(HAND_CAPACITY);
    expect(economy.snapshot().hand).toEqual({ item: null, amount: 0 });
  });
});
