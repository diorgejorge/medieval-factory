import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/core/data/data';
import { foodItems, toolsOf } from '../src/core/economy/itemIndex';

describe('índice de itens', () => {
  it('lista as ferramentas por tipo e nível mínimo, na ordem dos dados', () => {
    const axes = [...GAME_DATA.items.values()].filter((item) => item.tool?.kind === 'axe').map((item) => item.id);
    expect(toolsOf('axe', 1).map((tool) => tool.item)).toEqual(axes);
    expect(toolsOf('axe', 2).every((tool) => tool.tier >= 2)).toBe(true);
    expect(toolsOf('axe', 2).map((tool) => tool.item)).toContain('iron_axe');
    expect(toolsOf('axe', 2).map((tool) => tool.item)).not.toContain('stone_axe');
  });

  it('lista a comida na ordem dos dados', () => {
    const foods = [...GAME_DATA.items.values()].filter((item) => item.category === 'food').map((item) => item.id);
    expect(foodItems()).toEqual(foods);
  });
});
