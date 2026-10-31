import { Terrain, type TerrainType } from '../world/terrain';

export const ERAS = [1, 2, 3, 4] as const;
export type Era = (typeof ERAS)[number];

/** Nível de ferramenta: 1 pedra, 2 ferro, 3 aço. */
export const TOOL_TIERS = [1, 2, 3] as const;
export type ToolTier = (typeof TOOL_TIERS)[number];

export const TOOL_KINDS = ['axe', 'pickaxe'] as const;
export type ToolKind = (typeof TOOL_KINDS)[number];

export const ITEM_CATEGORIES = ['resource', 'intermediate', 'food', 'fuel', 'tool'] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export interface ItemDef {
  id: string;
  name: string;
  era: Era;
  category: ItemCategory;
  /** Segundos de queima, para combustíveis. */
  fuel?: number;
  tool?: { kind: ToolKind; tier: ToolTier; uses: number };
  /** Vilarejos produzem e pedem. */
  trade?: boolean;
}

export interface BuildingDef {
  id: string;
  name: string;
  era: Era;
  width: number;
  height: number;
  /** Arte no atlas de objetos; sem ela a construção ainda não aparece na barra. */
  frame?: string;
  needsWater?: boolean;
  /** Extrator: tira 1 `item` do `terrain` em volta a cada `seconds` (dividido pelo nível da ferramenta). */
  extracts?: { item: string; terrain: TerrainType; seconds: number; tool?: { kind: ToolKind; minTier: ToolTier } };
  /** Armazém: guarda até `capacity` itens somados. */
  storage?: { capacity: number };
}

export interface ItemAmount {
  item: string;
  amount: number;
}

export interface RecipeDef {
  id: string;
  building: string;
  seconds: number;
  inputs: ItemAmount[];
  outputs: ItemAmount[];
  /** Combustíveis aceitos; sem a lista, a receita não queima nada. */
  fuel?: string[];
}

export interface GameData {
  items: ReadonlyMap<string, ItemDef>;
  buildings: ReadonlyMap<string, BuildingDef>;
  recipes: ReadonlyMap<string, RecipeDef>;
  /** Estoque e capacidade da vila do jogador, que é o primeiro armazém (data/jogo/inicio.json). */
  start: { capacity: number; servants: number; stock: ItemAmount[] };
}

/** Os arquivos de data/jogo e os nomes de data/texto/pt-BR, como vêm do disco (ainda sem conferir). */
export interface RawGameData {
  items: unknown;
  buildings: unknown;
  recipes: unknown;
  itemNames: unknown;
  buildingNames: unknown;
  start: unknown;
}

export class GameDataError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Dados do jogo inválidos:\n- ${problems.join('\n- ')}`);
  }
}

const ID_PATTERN = /^[a-z][a-z0-9_]*$/;
const MAX_BUILDING_SIDE = 8;

/** Nomes de terreno no JSON (os mesmos do atlas) → tipo de terreno no código. */
const TERRAIN_BY_NAME: Readonly<Record<string, TerrainType>> = {
  grass: Terrain.Grass,
  sand: Terrain.Sand,
  water: Terrain.Water,
  forest: Terrain.Forest,
  rock: Terrain.Rock,
  ore_iron: Terrain.OreIron,
  dirt: Terrain.Dirt,
};

/**
 * Confere e converte os JSON de data/jogo. Junta todos os problemas antes de falhar,
 * para quem editou os dados ver tudo de uma vez.
 */
export function parseGameData(raw: RawGameData): GameData {
  const problems: string[] = [];
  const itemNames = parseNames(raw.itemNames, 'items', 'texto/pt-BR/itens.json', problems);
  const buildingNames = parseNames(raw.buildingNames, 'buildings', 'texto/pt-BR/construcoes.json', problems);
  const items = parseList(raw.items, 'items', 'itens.json', problems, (entry, where) =>
    parseItem(entry, where, itemNames, problems),
  );
  const buildings = parseList(raw.buildings, 'buildings', 'construcoes.json', problems, (entry, where) =>
    parseBuilding(entry, where, items, buildingNames, problems),
  );
  const recipes = parseList(raw.recipes, 'recipes', 'receitas.json', problems, (entry, where) =>
    parseRecipe(entry, where, items, buildings, problems),
  );
  const start = parseStart(raw.start, items, problems);
  if (problems.length > 0) throw new GameDataError(problems);
  return { items, buildings, recipes, start };
}

function parseStart(file: unknown, items: ReadonlyMap<string, ItemDef>, problems: string[]): GameData['start'] {
  const where = 'inicio.json';
  if (!isObject(file) || typeof file['version'] !== 'number') {
    problems.push(`${where}: precisa de "version" (número)`);
    return { capacity: 0, servants: 0, stock: [] };
  }
  return {
    capacity: requirePositiveInt(file, 'capacity', where, problems),
    servants: requirePositiveInt(file, 'servants', where, problems),
    stock: parseAmounts(file['stock'], `${where} stock`, items, problems),
  };
}

function parseList<T extends { id: string }>(
  file: unknown,
  key: string,
  fileName: string,
  problems: string[],
  parse: (entry: Record<string, unknown>, where: string) => T | null,
): Map<string, T> {
  const result = new Map<string, T>();
  if (!isObject(file) || typeof file['version'] !== 'number' || !Array.isArray(file[key])) {
    problems.push(`${fileName}: precisa de "version" (número) e da lista "${key}"`);
    return result;
  }
  (file[key] as unknown[]).forEach((entry, index) => {
    const where = `${fileName} #${index}`;
    if (!isObject(entry)) {
      problems.push(`${where}: não é um objeto`);
      return;
    }
    const id = entry['id'];
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
      problems.push(`${where}: "id" deve ser snake_case (ex.: iron_ore)`);
      return;
    }
    if (result.has(id)) {
      problems.push(`${fileName}: id repetido "${id}"`);
      return;
    }
    const parsed = parse(entry, `${fileName} "${id}"`);
    if (parsed) result.set(id, parsed);
  });
  return result;
}

function parseItem(
  entry: Record<string, unknown>,
  where: string,
  names: ReadonlyMap<string, string>,
  problems: string[],
): ItemDef | null {
  const before = problems.length;
  const item: ItemDef = {
    id: entry['id'] as string,
    name: requireName(entry['id'] as string, names, where, problems),
    era: requireOneOf(entry, 'era', ERAS, where, problems),
    category: requireOneOf(entry, 'category', ITEM_CATEGORIES, where, problems),
  };
  if (entry['fuel'] !== undefined) item.fuel = requirePositive(entry, 'fuel', where, problems);
  if (entry['trade'] !== undefined) item.trade = entry['trade'] === true;
  if (entry['tool'] !== undefined) {
    const tool = entry['tool'];
    if (isObject(tool)) {
      item.tool = {
        kind: requireOneOf(tool, 'kind', TOOL_KINDS, `${where} tool`, problems),
        tier: requireOneOf(tool, 'tier', TOOL_TIERS, `${where} tool`, problems),
        uses: requirePositiveInt(tool, 'uses', `${where} tool`, problems),
      };
    } else {
      problems.push(`${where}: "tool" deve ser { kind, tier, uses }`);
    }
  }
  if (item.category === 'tool' && !item.tool) problems.push(`${where}: ferramenta sem "tool"`);
  if (item.category === 'fuel' && item.fuel === undefined) problems.push(`${where}: combustível sem "fuel"`);
  return problems.length === before ? item : null;
}

function parseBuilding(
  entry: Record<string, unknown>,
  where: string,
  items: ReadonlyMap<string, ItemDef>,
  names: ReadonlyMap<string, string>,
  problems: string[],
): BuildingDef | null {
  const before = problems.length;
  const building: BuildingDef = {
    id: entry['id'] as string,
    name: requireName(entry['id'] as string, names, where, problems),
    era: requireOneOf(entry, 'era', ERAS, where, problems),
    width: requireSide(entry, 'width', where, problems),
    height: requireSide(entry, 'height', where, problems),
  };
  if (entry['frame'] !== undefined) building.frame = requireString(entry, 'frame', where, problems);
  if (entry['needsWater'] !== undefined) building.needsWater = entry['needsWater'] === true;
  if (entry['extracts'] !== undefined) {
    const extracts = entry['extracts'];
    const terrain = isObject(extracts) ? TERRAIN_BY_NAME[String(extracts['terrain'])] : undefined;
    if (!isObject(extracts) || terrain === undefined) {
      problems.push(`${where}: "extracts.terrain" deve ser um destes: ${Object.keys(TERRAIN_BY_NAME).join(', ')}`);
    } else {
      building.extracts = {
        item: requireItem(extracts, 'item', items, `${where} extracts`, problems),
        terrain,
        seconds: requirePositive(extracts, 'seconds', `${where} extracts`, problems),
      };
      const tool = extracts['tool'];
      if (isObject(tool)) {
        building.extracts.tool = {
          kind: requireOneOf(tool, 'kind', TOOL_KINDS, `${where} extracts.tool`, problems),
          minTier: requireOneOf(tool, 'minTier', TOOL_TIERS, `${where} extracts.tool`, problems),
        };
      } else if (tool !== undefined) {
        problems.push(`${where}: "extracts.tool" deve ser { kind, minTier }`);
      }
    }
  }
  if (entry['storage'] !== undefined) {
    const storage = entry['storage'];
    if (isObject(storage)) building.storage = { capacity: requirePositiveInt(storage, 'capacity', `${where} storage`, problems) };
    else problems.push(`${where}: "storage" deve ser { capacity }`);
  }
  return problems.length === before ? building : null;
}

function parseRecipe(
  entry: Record<string, unknown>,
  where: string,
  items: ReadonlyMap<string, ItemDef>,
  buildings: ReadonlyMap<string, BuildingDef>,
  problems: string[],
): RecipeDef | null {
  const before = problems.length;
  const building = entry['building'];
  if (typeof building !== 'string' || !buildings.has(building)) {
    problems.push(`${where}: "building" não existe em construcoes.json`);
  }
  const recipe: RecipeDef = {
    id: entry['id'] as string,
    building: String(building),
    seconds: requirePositive(entry, 'seconds', where, problems),
    inputs: parseAmounts(entry['inputs'], `${where} inputs`, items, problems),
    outputs: parseAmounts(entry['outputs'], `${where} outputs`, items, problems),
  };
  if (recipe.outputs.length === 0) problems.push(`${where}: receita sem "outputs"`);
  if (entry['fuel'] !== undefined) {
    const fuel = entry['fuel'];
    if (!Array.isArray(fuel) || fuel.length === 0) {
      problems.push(`${where}: "fuel" deve ser uma lista de itens`);
    } else {
      recipe.fuel = fuel.map(String);
      for (const id of recipe.fuel) {
        if (items.get(id)?.fuel === undefined) problems.push(`${where}: "${id}" não é um combustível`);
      }
    }
  }
  return problems.length === before ? recipe : null;
}

function parseAmounts(
  value: unknown,
  where: string,
  items: ReadonlyMap<string, ItemDef>,
  problems: string[],
): ItemAmount[] {
  if (!Array.isArray(value)) {
    problems.push(`${where}: deve ser uma lista de { item, amount }`);
    return [];
  }
  return value.flatMap((entry: unknown) => {
    if (!isObject(entry)) {
      problems.push(`${where}: cada entrada é { item, amount }`);
      return [];
    }
    return [{ item: requireItem(entry, 'item', items, where, problems), amount: requirePositiveInt(entry, 'amount', where, problems) }];
  });
}

/** Arquivo de nomes do Roteiro: { version, <key>: { "<id>": "nome" } }. */
function parseNames(file: unknown, key: string, fileName: string, problems: string[]): Map<string, string> {
  const names = new Map<string, string>();
  const entries = isObject(file) ? file[key] : undefined;
  if (!isObject(file) || typeof file['version'] !== 'number' || !isObject(entries)) {
    problems.push(`${fileName}: precisa de "version" (número) e do objeto "${key}"`);
    return names;
  }
  for (const [id, name] of Object.entries(entries)) {
    if (typeof name === 'string' && name.length > 0) names.set(id, name);
    else problems.push(`${fileName}: nome de "${id}" deve ser um texto`);
  }
  return names;
}

function requireName(id: string, names: ReadonlyMap<string, string>, where: string, problems: string[]): string {
  const name = names.get(id);
  if (name) return name;
  problems.push(`${where}: falta o nome em data/texto/pt-BR`);
  return id;
}

function requireItem(
  entry: Record<string, unknown>,
  key: string,
  items: ReadonlyMap<string, ItemDef>,
  where: string,
  problems: string[],
): string {
  const id = entry[key];
  if (typeof id !== 'string' || !items.has(id)) problems.push(`${where}: item "${String(id)}" não existe em itens.json`);
  return String(id);
}

function requireString(entry: Record<string, unknown>, key: string, where: string, problems: string[]): string {
  const value = entry[key];
  if (typeof value === 'string' && value.length > 0) return value;
  problems.push(`${where}: "${key}" deve ser um texto`);
  return '';
}

function requireOneOf<T extends number | string>(
  entry: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  where: string,
  problems: string[],
): T {
  const value = entry[key];
  if (allowed.includes(value as T)) return value as T;
  problems.push(`${where}: "${key}" deve ser um destes: ${allowed.join(', ')}`);
  return allowed[0] as T;
}

function requirePositive(entry: Record<string, unknown>, key: string, where: string, problems: string[]): number {
  const value = entry[key];
  if (typeof value === 'number' && value > 0) return value;
  problems.push(`${where}: "${key}" deve ser um número maior que zero`);
  return 1;
}

function requirePositiveInt(entry: Record<string, unknown>, key: string, where: string, problems: string[]): number {
  const value = requirePositive(entry, key, where, problems);
  if (!Number.isInteger(value)) problems.push(`${where}: "${key}" deve ser inteiro`);
  return value;
}

function requireSide(entry: Record<string, unknown>, key: string, where: string, problems: string[]): number {
  const value = requirePositiveInt(entry, key, where, problems);
  if (value > MAX_BUILDING_SIDE) problems.push(`${where}: "${key}" passa de ${MAX_BUILDING_SIDE} tiles`);
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
