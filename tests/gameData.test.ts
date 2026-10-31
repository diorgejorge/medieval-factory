import { describe, expect, it } from 'vitest';
import buildings from '../data/jogo/construcoes.json';
import items from '../data/jogo/itens.json';
import eras from '../data/jogo/eras.json';
import start from '../data/jogo/inicio.json';
import recipes from '../data/jogo/receitas.json';
import challenges from '../data/jogo/desafios.json';
import buildingNames from '../data/texto/pt-BR/construcoes.json';
import itemNames from '../data/texto/pt-BR/itens.json';
import { GAME_DATA } from '../src/core/data/data';
import { BUILDING_CATEGORIES, GameDataError, parseGameData, type RawGameData } from '../src/core/data/gameData';
import { Terrain } from '../src/core/world/terrain';
import objectsAtlas from '../assets/objects/objects.json';

/** Cópia profunda dos dados reais, para estragar um pedaço por teste. */
function rawCopy() {
  return structuredClone({ items, buildings, recipes, itemNames, buildingNames, start, eras, challenges });
}

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('faltou um valor no teste');
  return value;
}

function problemsOf(raw: RawGameData): string[] {
  try {
    parseGameData(raw);
    return [];
  } catch (error) {
    if (error instanceof GameDataError) return [...error.problems];
    throw error;
  }
}

describe('dados do jogo (data/jogo)', () => {
  it('os JSON do repositório são válidos', () => {
    expect(problemsOf(rawCopy())).toEqual([]);
    expect(GAME_DATA.items.size).toBe(items.items.length);
    expect(GAME_DATA.buildings.size).toBe(buildings.buildings.length);
    expect(GAME_DATA.recipes.size).toBe(recipes.recipes.length);
  });

  it('converte era, ferramenta, combustível e terreno do extrator', () => {
    expect(GAME_DATA.items.get('iron_axe')).toMatchObject({ era: 2, category: 'tool', tool: { tier: 2 } });
    expect(GAME_DATA.items.get('charcoal')?.fuel).toBeGreaterThan(GAME_DATA.items.get('firewood')?.fuel ?? 0);
    expect(GAME_DATA.buildings.get('lumberjack')?.extracts).toEqual({
      item: 'wood',
      terrain: Terrain.Forest,
      seconds: 6,
      tool: { kind: 'axe', minTier: 1 },
    });
    expect(GAME_DATA.start.stock).toContainEqual({ item: 'stone_axe', amount: 2 });
    expect(GAME_DATA.recipes.get('bake_bread')).toMatchObject({ building: 'oven', fuel: ['firewood', 'charcoal'] });
  });

  it('a cadeia do pão e a do ferro fecham com os dados', () => {
    const produced = new Set([...GAME_DATA.recipes.values()].flatMap((r) => r.outputs.map((o) => o.item)));
    const extracted = new Set([...GAME_DATA.buildings.values()].flatMap((b) => (b.extracts ? [b.extracts.item] : [])));
    for (const item of ['bread', 'iron_ingot', 'iron_axe', 'charcoal', 'firewood']) expect(produced).toContain(item);
    for (const item of ['wood', 'stone', 'wheat', 'iron_ore']) expect(extracted).toContain(item);
  });

  it('acusa ids repetidos e fora do padrão', () => {
    const raw = rawCopy();
    raw.items.items.push({ ...must(raw.items.items[0]) }, { ...must(raw.items.items[0]), id: 'Madeira' });
    const problems = problemsOf(raw);
    expect(problems).toContain('itens.json: id repetido "wood"');
    expect(problems.some((p) => p.includes('snake_case'))).toBe(true);
  });

  it('acusa referências quebradas em receitas', () => {
    const raw = rawCopy();
    const recipe = must(raw.recipes.recipes[0]);
    recipe.building = 'castelo';
    must(recipe.inputs[0]).item = 'ouro';
    const problems = problemsOf(raw);
    expect(problems.some((p) => p.includes('"building" não existe'))).toBe(true);
    expect(problems.some((p) => p.includes('item "ouro" não existe'))).toBe(true);
  });

  it('acusa combustível que não queima, era e ferramenta inválidas', () => {
    const raw = rawCopy();
    must(raw.recipes.recipes.find((r) => r.id === 'bake_bread')).fuel = ['flour'];
    const axe = must(raw.items.items.find((i) => i.id === 'stone_axe'));
    axe.era = 9;
    axe.tool = { kind: 'axe', tier: 7, uses: 0 };
    const problems = problemsOf(raw);
    expect(problems.some((p) => p.includes('"flour" não é um combustível'))).toBe(true);
    expect(problems.some((p) => p.includes('"era" deve ser'))).toBe(true);
    expect(problems.some((p) => p.includes('"tier" deve ser'))).toBe(true);
    expect(problems.some((p) => p.includes('"uses" deve ser'))).toBe(true);
  });

  it('acusa arquivo sem version ou sem a lista', () => {
    expect(problemsOf({ ...rawCopy(), items: {} })[0]).toContain('itens.json');
  });

  it('acusa item ou construção sem nome nos textos do Roteiro', () => {
    const raw = rawCopy();
    const names: Record<string, string> = { ...raw.itemNames.items };
    delete names['bread'];
    const problems = problemsOf({ ...raw, itemNames: { version: 1, items: names } });
    expect(problems).toContain('itens.json "bread": falta o nome em data/texto/pt-BR');
  });

  it('toda construção com "frame" tem arte no atlas de objetos', () => {
    const names = new Set([...Object.keys(objectsAtlas.frames), ...Object.keys(objectsAtlas.animations)]);
    for (const building of GAME_DATA.buildings.values()) {
      if (building.frame) expect(names, building.id).toContain(building.frame);
    }
  });

  it('toda construção tem uma categoria da barra e categoria errada é apontada', () => {
    for (const building of GAME_DATA.buildings.values()) expect(BUILDING_CATEGORIES, building.id).toContain(building.category);
    const raw = rawCopy();
    (raw.buildings.buildings[0] as Record<string, unknown>)['category'] = 'castelo';
    expect(problemsOf(raw).some((p) => p.includes('"category" deve ser um destes'))).toBe(true);
  });

  it('usa os nomes do Roteiro', () => {
    expect(GAME_DATA.items.get('iron_ore')?.name).toBe('Minério de ferro');
    expect(GAME_DATA.buildings.get('oven')?.name).toBe(buildingNameOf('oven'));
  });
});

function buildingNameOf(buildingId: string): string | undefined {
  return (buildingNames.buildings as Record<string, string>)[buildingId];
}
