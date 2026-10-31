import { GameDataError } from './gameData';

/**
 * Chaves de data/texto/pt-BR/interface.json que o código usa, por seção, com os placeholders
 * que cada texto precisa ter (o código preenche esses e só esses).
 */
export const INTERFACE_KEYS = {
  common: {
    close: [],
    empty: [],
    itemAmount: ['item', 'quantidade'],
    itemSeparator: [],
    quote: ['texto'],
    listSeparator: [],
    eraLabel: ['numero', 'nome'],
  },
  hud: {
    debugLine: ['fps', 'zoom', 'seed', 'era'],
    simLine: ['ups', 'tick', 'estado'],
    starting: [],
    paused: [],
    speed: ['velocidade'],
    help: [],
    stock: ['itens'],
    servants: ['ocupados', 'total'],
    ownVillage: [],
  },
  toolbar: { remove: [], chooseBuilding: [], help: [], lockedEra: [] },
  placement: {
    unknown: [],
    outside: [],
    water: [],
    forest: [],
    occupied: [],
    reserved: [],
    lockedEra: [],
    needsWater: [],
    noResource: [],
  },
  buildingStatus: {
    working: [],
    noTool: [],
    noStorage: [],
    storageFull: [],
    noResource: [],
    noRecipe: [],
    noInput: [],
    noFuel: [],
    outputFull: [],
  },
  buildingPanel: {
    recipe: ['receita'],
    recipeFormat: ['entradas', 'saidas'],
    progress: ['progresso'],
    stored: ['total', 'capacidade'],
    tool: ['item', 'usos'],
    toolNone: [],
    recipeItem: ['quantidade', 'item'],
    recipeItemSeparator: [],
    recipeFuel: ['combustiveis'],
    // Do painel de separador, que ainda vai ser feito: já conferidos aqui.
    filterItem: ['item'],
    filterAny: [],
  },
  villagePanel: {
    population: ['populacao'],
    produces: ['itens'],
    wants: ['itens'],
    trade: ['quantidade', 'dar', 'receber'],
    recruit: ['comida'],
    recruitRefused: ['vilarejo', 'comida'],
  },
  eraNotice: { hint: [] },
} as const satisfies Record<string, Record<string, readonly string[]>>;

type Keys = typeof INTERFACE_KEYS;

/** Textos da interface já conferidos: uma seção por painel, um texto por chave. */
export type InterfaceText = { readonly [S in keyof Keys]: { readonly [K in keyof Keys[S]]: string } };

const FILE = 'texto/pt-BR/interface.json';

/**
 * Confere o interface.json do Roteiro: toda chave que o código usa precisa existir, ser um texto
 * e ter os placeholders que o código preenche. Junta todos os problemas antes de falhar.
 */
export function parseInterfaceText(file: unknown): InterfaceText {
  const problems: string[] = [];
  const result: Record<string, Record<string, string>> = {};
  if (!isObject(file) || typeof file['version'] !== 'number') problems.push(`${FILE}: precisa de "version" (número)`);
  for (const [section, keys] of Object.entries(INTERFACE_KEYS)) {
    const entries = isObject(file) ? file[section] : undefined;
    const texts: Record<string, string> = {};
    result[section] = texts;
    if (!isObject(entries)) {
      problems.push(`${FILE}: falta a seção "${section}"`);
      continue;
    }
    for (const [key, placeholders] of Object.entries<readonly string[]>(keys)) {
      const text = entries[key];
      if (typeof text !== 'string' || text.length === 0) {
        problems.push(`${FILE}: falta o texto "${section}.${key}"`);
        continue;
      }
      for (const name of placeholders) {
        if (!text.includes(`{${name}}`)) problems.push(`${FILE}: "${section}.${key}" precisa do placeholder {${name}}`);
      }
      texts[key] = text;
    }
  }
  if (problems.length > 0) throw new GameDataError(problems);
  return result as unknown as InterfaceText;
}

/** Põe o texto entre as aspas do interface.json (common.quote). */
export function quoteText(text: InterfaceText, inner: string): string {
  return fillText(text.common.quote, { texto: inner });
}

/** Troca cada {nome} do texto pelo valor dado; placeholders sem valor ficam como estão. */
export function fillText(text: string, values: Readonly<Record<string, string | number>>): string {
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
