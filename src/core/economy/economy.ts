import { TICKS_PER_SECOND } from '../config';
import { GAME_DATA } from '../data/data';
import type { BuildingDef, ItemAmount, ToolKind, ToolTier } from '../data/gameData';
import { buildingDef, countResourceTiles, footprint, type Building, type BuildingSite } from '../world/buildings';
import type { Grid } from '../world/grid';

/** Até onde (em tiles, do centro de uma construção ao da outra) um extrator alcança um armazém. */
export const STORAGE_RANGE = 24;
/** Id do armazém da vila do jogador (as construções começam em 1). */
export const START_STORAGE_ID = 0;

export type ExtractorStatus = 'working' | 'noTool' | 'noStorage' | 'storageFull' | 'noResource';

export interface HeldTool {
  item: string;
  usesLeft: number;
}

/** O que a tela precisa saber de cada construção com economia. */
export interface BuildingReport {
  status?: ExtractorStatus;
  tool?: HeldTool | null;
  /** Conteúdo, para armazéns. */
  items?: Record<string, number>;
  capacity?: number;
}

export interface EconomySnapshot {
  /** Soma de todos os armazéns. */
  stock: Record<string, number>;
  buildings: Record<number, BuildingReport>;
}

interface Storage {
  center: { x: number; y: number };
  capacity: number;
  items: Map<string, number>;
}

interface Extractor {
  def: Required<Pick<BuildingDef, 'extracts'>>['extracts'];
  center: { x: number; y: number };
  /** Tiles do terreno certo em volta: zero = nada para extrair. */
  resourceTiles: number;
  progressTicks: number;
  tool: HeldTool | null;
  status: ExtractorStatus;
}

/**
 * Extratores e armazéns. Enquanto não há servos (frente 10), o extrator entrega direto no
 * armazém mais próximo dentro do alcance; ele também busca lá a ferramenta de que precisa.
 */
export class Economy {
  private readonly storages = new Map<number, Storage>();
  private readonly extractors = new Map<number, Extractor>();

  constructor(
    private readonly grid: Grid,
    startCenter: { x: number; y: number } | null,
    start: { capacity: number; stock: readonly ItemAmount[] } = GAME_DATA.start,
  ) {
    if (startCenter) {
      const items = new Map(start.stock.map(({ item, amount }) => [item, amount]));
      this.storages.set(START_STORAGE_ID, { center: startCenter, capacity: start.capacity, items });
    }
  }

  /** Acompanha as construções do terreno: cria o estado das novas e descarta o das removidas. */
  sync(site: BuildingSite): void {
    const alive = new Set<number>([START_STORAGE_ID]);
    for (const building of site.all) {
      alive.add(building.id);
      const def = buildingDef(building.kind);
      const center = buildingCenter(building);
      if (def.storage && !this.storages.has(building.id)) {
        this.storages.set(building.id, { center, capacity: def.storage.capacity, items: new Map() });
      }
      const extractor = this.extractors.get(building.id);
      if (def.extracts && !extractor) {
        this.extractors.set(building.id, {
          def: def.extracts,
          center,
          resourceTiles: countResourceTiles(this.grid, building, def.extracts.terrain),
          progressTicks: 0,
          tool: null,
          status: 'working',
        });
      } else if (extractor) {
        // Girar muda a forma e, com ela, o terreno em volta.
        extractor.center = center;
        extractor.resourceTiles = countResourceTiles(this.grid, building, extractor.def.terrain);
      }
    }
    for (const id of this.storages.keys()) if (!alive.has(id)) this.storages.delete(id);
    for (const id of this.extractors.keys()) if (!alive.has(id)) this.extractors.delete(id);
  }

  /** Um tick: cada extrator avança, e entrega um item quando completa o ciclo. */
  step(): void {
    for (const extractor of this.extractors.values()) this.stepExtractor(extractor);
  }

  snapshot(): EconomySnapshot {
    const stock: Record<string, number> = {};
    const buildings: Record<number, BuildingReport> = {};
    for (const [id, storage] of this.storages) {
      const items = Object.fromEntries(storage.items);
      for (const [item, amount] of storage.items) stock[item] = (stock[item] ?? 0) + amount;
      buildings[id] = { items, capacity: storage.capacity };
    }
    for (const [id, extractor] of this.extractors) {
      buildings[id] = { status: extractor.status, tool: extractor.tool && { ...extractor.tool } };
    }
    return { stock, buildings };
  }

  private stepExtractor(extractor: Extractor): void {
    if (extractor.resourceTiles === 0) {
      extractor.status = 'noResource';
      return;
    }
    const storages = this.storagesInRange(extractor.center);
    if (storages.length === 0) {
      extractor.status = 'noStorage';
      return;
    }
    const required = extractor.def.tool;
    if (required && !extractor.tool) extractor.tool = this.takeTool(storages, required.kind, required.minTier);
    if (required && !extractor.tool) {
      extractor.status = 'noTool';
      return;
    }
    const target = storages.find((s) => used(s) < s.capacity);
    if (!target) {
      extractor.status = 'storageFull';
      return;
    }

    extractor.status = 'working';
    extractor.progressTicks += this.toolTier(extractor.tool);
    if (extractor.progressTicks < extractor.def.seconds * TICKS_PER_SECOND) return;
    extractor.progressTicks = 0;
    add(target, extractor.def.item, 1);
    if (extractor.tool && --extractor.tool.usesLeft <= 0) extractor.tool = null;
  }

  /** Nível da ferramenta acelera a extração: ferro trabalha no dobro da velocidade da pedra. */
  private toolTier(tool: HeldTool | null): number {
    return tool ? (GAME_DATA.items.get(tool.item)?.tool?.tier ?? 1) : 1;
  }

  /** Pega no armazém mais próximo a melhor ferramenta do tipo pedido, se houver. */
  private takeTool(storages: readonly Storage[], kind: ToolKind, minTier: ToolTier): HeldTool | null {
    for (const storage of storages) {
      let best: { item: string; tier: number; uses: number } | null = null;
      for (const [item, amount] of storage.items) {
        const tool = GAME_DATA.items.get(item)?.tool;
        if (amount <= 0 || !tool || tool.kind !== kind || tool.tier < minTier) continue;
        if (!best || tool.tier > best.tier) best = { item, tier: tool.tier, uses: tool.uses };
      }
      if (best) {
        add(storage, best.item, -1);
        return { item: best.item, usesLeft: best.uses };
      }
    }
    return null;
  }

  /** Armazéns ao alcance, do mais perto para o mais longe (empate: o de id menor). */
  private storagesInRange(center: { x: number; y: number }): Storage[] {
    return [...this.storages.values()]
      .map((storage) => ({ storage, distance: Math.hypot(storage.center.x - center.x, storage.center.y - center.y) }))
      .filter(({ distance }) => distance <= STORAGE_RANGE)
      .sort((a, b) => a.distance - b.distance)
      .map(({ storage }) => storage);
  }
}

function buildingCenter(building: Building): { x: number; y: number } {
  const { width, height } = footprint(building.kind, building.rotation);
  return { x: building.x + width / 2, y: building.y + height / 2 };
}

function used(storage: Storage): number {
  let total = 0;
  for (const amount of storage.items.values()) total += amount;
  return total;
}

function add(storage: Storage, item: string, amount: number): void {
  const next = (storage.items.get(item) ?? 0) + amount;
  if (next > 0) storage.items.set(item, next);
  else storage.items.delete(item);
}
