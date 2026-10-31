import { TICKS_PER_SECOND } from '../config';
import { GAME_DATA } from '../data/data';
import type { BuildingDef, ItemAmount, ToolKind, ToolTier } from '../data/gameData';
import { buildingDef, countResourceTiles, footprint, type Building, type BuildingSite } from '../world/buildings';
import type { Grid } from '../world/grid';
import { Machine, recipesFor, type MachineStatus } from './machines';
import { Servant, stepServants, type Demand, type ServantView } from './servants';
import { add, available, markStoragesChanged, storageChanges, used, type Storage } from './storage';
import { recruit, trade, type VillageState, type VillageView } from './villageTrade';

/** Até onde (em tiles, do centro de uma construção ao da outra) um extrator alcança um armazém. */
export const STORAGE_RANGE = 24;
/** Id do armazém da vila do jogador (as construções começam em 1). */
export const START_STORAGE_ID = 0;
/** De quantos em quantos ticks os pedidos aos servos são recalculados. */
const DEMAND_INTERVAL_TICKS = 15;

export type ExtractorStatus = 'working' | 'noTool' | 'noStorage' | 'storageFull' | 'noResource';

export interface HeldTool {
  item: string;
  usesLeft: number;
}

/** O que a tela precisa saber de cada construção com economia. */
export interface BuildingReport {
  status?: ExtractorStatus | MachineStatus;
  /** Receita atual e as possíveis, para máquinas. */
  recipe?: string | null;
  recipes?: string[];
  /** Andamento da receita, de 0 a 1. */
  progress?: number;
  tool?: HeldTool | null;
  /** Conteúdo, para armazéns. */
  items?: Record<string, number>;
  capacity?: number;
}

export interface EconomySnapshot {
  /** Soma de todos os armazéns. */
  stock: Record<string, number>;
  buildings: Record<number, BuildingReport>;
  servants: ServantView[];
  /** Mesma ordem dos vilarejos do mapa. */
  villages: VillageView[];
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
  private readonly machines = new Map<number, Machine>();
  private readonly machineKinds = new Map<number, string>();
  private readonly servants: Servant[] = [];
  private readonly villages: VillageState[];
  private readonly home: { x: number; y: number } | null;
  private demands: Demand[] = [];
  private ticksUntilDemands = 0;

  constructor(
    private readonly grid: Grid,
    startCenter: { x: number; y: number } | null,
    start: { capacity: number; servants: number; stock: readonly ItemAmount[] } = GAME_DATA.start,
    villages: readonly { produces: readonly string[]; wants: readonly string[]; population: number }[] = [],
  ) {
    this.home = startCenter;
    this.villages = villages.map((v) => ({ produces: v.produces, wants: v.wants, population: v.population, result: null, requests: 0 }));
    if (startCenter) {
      const items = new Map(start.stock.map(({ item, amount }) => [item, amount]));
      this.storages.set(START_STORAGE_ID, { center: startCenter, capacity: start.capacity, items });
      for (let i = 0; i < start.servants; i++) this.servants.push(new Servant(startCenter.x, startCenter.y));
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
      const recipes = recipesFor(building.kind);
      if (recipes.length > 0 && !this.machines.has(building.id)) {
        this.machines.set(building.id, new Machine(center, recipes[0] ?? null));
        this.machineKinds.set(building.id, building.kind);
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
    for (const id of this.machines.keys()) {
      if (alive.has(id)) continue;
      this.machines.delete(id);
      this.machineKinds.delete(id);
    }
    markStoragesChanged();
  }

  /** Troca com um vilarejo; o produto vai para a vila do jogador. */
  tradeWithVillage(index: number, give: string, receive: string): boolean {
    const village = this.villages[index];
    const home = this.storages.get(START_STORAGE_ID);
    if (!village || !home) return false;
    return trade(village, give, receive, [...this.storages.values()], home);
  }

  /** Recruta um servo do vilarejo, pago com comida; ele começa na vila do jogador. */
  recruitFromVillage(index: number): boolean {
    const village = this.villages[index];
    if (!village || !this.home || !recruit(village, [...this.storages.values()])) return false;
    this.servants.push(new Servant(this.home.x, this.home.y));
    return true;
  }

  /** Troca a receita de uma máquina, se ela souber fazer essa receita. */
  setRecipe(buildingId: number, recipeId: string): boolean {
    const machine = this.machines.get(buildingId);
    const recipe = recipesFor(this.machineKinds.get(buildingId) ?? '').find((r) => r.id === recipeId);
    if (!machine || !recipe) return false;
    machine.setRecipe(recipe);
    return true;
  }

  /** Um tick: extratores avançam e entregam; máquinas acordadas puxam insumos e produzem. */
  step(): void {
    for (const extractor of this.extractors.values()) this.stepExtractor(extractor);
    for (const machine of this.machines.values()) {
      if (machine.isSleeping(storageChanges())) continue;
      machine.step(this.storagesInRange(machine.center), storageChanges());
    }
    // Pedidos mudam devagar: recalcular a cada meio segundo basta e poupa a simulação.
    if (--this.ticksUntilDemands <= 0) {
      this.demands = this.collectDemands();
      this.ticksUntilDemands = DEMAND_INTERVAL_TICKS;
    }
    stepServants(this.servants, this.storages, this.demands);
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
    for (const [id, machine] of this.machines) {
      buildings[id] = {
        status: machine.status,
        recipe: machine.recipe?.id ?? null,
        recipes: recipesFor(this.machineKinds.get(id) ?? '').map((r) => r.id),
        progress: machine.progress,
      };
    }
    return {
      stock,
      buildings,
      servants: this.servants.map((s) => s.view()),
      villages: this.villages.map(({ population, result, requests }) => ({ population, result, requests })),
    };
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

  /**
   * O que falta para cada máquina ou extrator parado, pedido ao armazém mais próximo dele.
   * Os servos trazem de armazéns fora do alcance da construção.
   */
  private collectDemands(): Demand[] {
    const demands: Demand[] = [];
    const request = (center: { x: number; y: number }, item: string, amount: number) => {
      const storageId = this.nearestStorageId(center);
      if (storageId !== null && amount > 0) demands.push({ storageId, item, amount, requester: center, reach: STORAGE_RANGE });
    };
    for (const machine of this.machines.values()) {
      const recipe = machine.recipe;
      if (!recipe) continue;
      const storages = this.storagesInRange(machine.center);
      if (machine.status === 'noInput') {
        for (const { item, amount } of recipe.inputs) request(machine.center, item, amount - available(storages, item));
      } else if (machine.status === 'noFuel' && recipe.fuel) {
        const fuel = recipe.fuel.find((item) => this.totalStock(item) > 0);
        if (fuel) request(machine.center, fuel, 1);
      }
    }
    for (const extractor of this.extractors.values()) {
      const required = extractor.def.tool;
      if (extractor.status !== 'noTool' || !required) continue;
      const tool = [...GAME_DATA.items.values()].find(
        (item) => item.tool?.kind === required.kind && item.tool.tier >= required.minTier && this.totalStock(item.id) > 0,
      );
      if (tool) request(extractor.center, tool.id, 1);
    }
    return demands;
  }

  /** Quanto do item há somando todos os armazéns. */
  stockOf(item: string): number {
    return this.totalStock(item);
  }

  private totalStock(item: string): number {
    return available([...this.storages.values()], item);
  }

  private nearestStorageId(center: { x: number; y: number }): number | null {
    let best: number | null = null;
    let bestDistance = STORAGE_RANGE;
    for (const [id, storage] of this.storages) {
      const distance = Math.hypot(storage.center.x - center.x, storage.center.y - center.y);
      if (distance <= bestDistance) {
        best = id;
        bestDistance = distance;
      }
    }
    return best;
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

