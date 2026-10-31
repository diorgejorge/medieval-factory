import { GAME_DATA } from '../data/data';
import type { ToolKind } from '../data/gameData';

export interface ToolEntry {
  item: string;
  tier: number;
  uses: number;
}

interface ItemIndex {
  /** Ferramentas de cada tipo, na ordem dos dados. */
  toolsByKind: Map<ToolKind, readonly ToolEntry[]>;
  /** Itens de comida, na ordem dos dados. */
  foods: readonly string[];
}

/** Montado uma vez, na primeira consulta: os dados do jogo não mudam durante a partida. */
let index: ItemIndex | null = null;

function itemIndex(): ItemIndex {
  if (index) return index;
  const toolsByKind = new Map<ToolKind, ToolEntry[]>();
  const foods: string[] = [];
  for (const item of GAME_DATA.items.values()) {
    if (item.category === 'food') foods.push(item.id);
    if (!item.tool) continue;
    const list = toolsByKind.get(item.tool.kind) ?? [];
    list.push({ item: item.id, tier: item.tool.tier, uses: item.tool.uses });
    toolsByKind.set(item.tool.kind, list);
  }
  index = { toolsByKind, foods };
  return index;
}

/** Ferramentas do tipo com nível de pelo menos `minTier`, na ordem dos dados. */
export function toolsOf(kind: ToolKind, minTier: number): readonly ToolEntry[] {
  return (itemIndex().toolsByKind.get(kind) ?? []).filter((tool) => tool.tier >= minTier);
}

/** Ids dos itens de comida, na ordem dos dados. */
export function foodItems(): readonly string[] {
  return itemIndex().foods;
}
