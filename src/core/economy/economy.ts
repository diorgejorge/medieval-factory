import { TICKS_PER_SECOND } from '../config';
import { GAME_DATA } from '../data/data';
import { PRODUCE_TARGET, VILLAGE_TARGET, type BuildingDef, type ItemAmount, type ToolKind, type ToolTier } from '../data/gameData';
import { buildingCenter, buildingDef, countResourceTiles, footprint, type Building, type BuildingSite } from '../world/buildings';
import type { Grid } from '../world/grid';
import { Machine, recipesFor, type MachineStatus } from './machines';
import { Servant, stepServants, type Demand, type ServantView } from './servants';
import { toolsOf, type ToolEntry } from './itemIndex';
import { add, available, createStorage, freeSpace, used, type Storage } from './storage';
import { recruit, trade, type VillageState, type VillageView } from './villageTrade';
import { Segment, TransportNetwork, type SegmentView } from './transport';
import { buildNetworks, type PowerNetwork } from './torque';
import { CartFleet, validRoute, type CartRoute, type CartView, type CartWorld } from './carts';
import type { Area } from '../world/villages';

/** Até onde (em tiles, do centro de uma construção ao da outra) um extrator alcança um armazém. */
export const STORAGE_RANGE = 24;
/** Id do armazém da vila do jogador (as construções começam em 1). */
export const START_STORAGE_ID = 0;
/** De quantos em quantos ticks os pedidos aos servos são recalculados. */
const DEMAND_INTERVAL_TICKS = 15;
/** Até onde (em tiles, do centro da vila ao da fonte) uma fonte conta para os decretos. */
export const TOWN_RANGE = 12;
/** Quanto o camponês do jogador carrega nas mãos de uma vez. */
export const HAND_CAPACITY = 10;
/** Máquina com força da rede de eixos trabalha esse tanto mais rápido. */
export const TORQUE_SPEEDUP = 2;
/** Por quanto tempo a fonte segue jorrando depois da última água que chegou. */
const SINK_ACTIVE_TICKS = 5 * TICKS_PER_SECOND;

export type ExtractorStatus = 'working' | 'noTool' | 'noStorage' | 'storageFull' | 'noResource';
/** Fonte: jorrando (água chegou há pouco), seca, ou longe demais da vila para contar. */
export type SinkStatus = 'working' | 'dry' | 'farFromTown';

export interface HeldTool {
  item: string;
  usesLeft: number;
}

/** O que a tela precisa saber de cada construção com economia. */
export interface BuildingReport {
  status?: ExtractorStatus | MachineStatus | SinkStatus;
  /** Fonte: quanto já chegou nela no total. */
  delivered?: number;
  /** Rede de eixos da construção: força gerada e pedida na rede inteira. */
  torque?: { supply: number; demand: number; powered: boolean };
  /** Receita atual e as possíveis, para máquinas. */
  recipe?: string | null;
  recipes?: string[];
  /** Andamento da receita, de 0 a 1. */
  progress?: number;
  tool?: HeldTool | null;
  /** Conteúdo, para armazéns. */
  items?: Record<string, number>;
  capacity?: number;
  /** Separador: item que segue em frente (null = o primeiro que chegar). */
  filter?: string | null;
  /** Pátio das carroças: rota atual (null = nenhuma) e as carroças dele. */
  route?: CartRoute | null;
  carts?: CartView[];
}

export interface EconomySnapshot {
  /** Soma de todos os armazéns. */
  stock: Record<string, number>;
  buildings: Record<number, BuildingReport>;
  servants: ServantView[];
  /** Mesma ordem dos vilarejos do mapa. */
  villages: VillageView[];
  /** Calhas e esteiras com os itens em cima (t de 0 a 1 ao longo do tile). */
  segments: SegmentView[];
  /** Carroças de todos os pátios: centro em tiles (fracionário) e direção do movimento. */
  carts: CartView[];
  /** O que o camponês do jogador carrega. */
  hand: { item: string | null; amount: number };
}

/** Economia num jogo salvo (ver Economy.save). */
export interface EconomySave {
  storages: [number, [string, number][]][];
  servants: number;
  villages: number[];
  hand: { item: string | null; amount: number };
  deliveries: [string, number][];
  tools: [number, HeldTool][];
  recipes: [number, string][];
  filters: [number, string][];
  routes: [number, CartRoute][];
}

interface Sink {
  kind: string;
  item: string;
  /** Longe demais da vila: recusa tudo. */
  far: boolean;
  delivered: number;
  lastDeliveryTick: number;
}

interface Extractor {
  def: Required<Pick<BuildingDef, 'extracts'>>['extracts'];
  center: { x: number; y: number };
  /** Tiles do terreno certo em volta: zero = nada para extrair. */
  resourceTiles: number;
  progressTicks: number;
  tool: HeldTool | null;
  status: ExtractorStatus;
  /** Tile da calha ou esteira de saída; com ela, o produto vai para a fila em vez do armazém. */
  outputTile: { x: number; y: number } | null;
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
  private readonly transport: TransportNetwork;
  private site: BuildingSite | null = null;
  /** Armazéns ao alcance de cada máquina ou extrator (por id), do mais perto ao mais longe. */
  private readonly ranges = new Map<number, readonly Storage[]>();
  private readonly carts = new CartFleet();
  private readonly cartWorld: CartWorld;
  private readonly villageAreas: (Area | null)[];
  private readonly sinks = new Map<number, Sink>();
  /** Total entregue em fontes, por construção e item (`kind:item`); remover a fonte não apaga. */
  private readonly deliveries = new Map<string, number>();
  private ticks = 0;
  /** O que o camponês do jogador leva nas mãos. */
  private readonly hand: { item: string | null; amount: number } = { item: null, amount: 0 };
  /** Rede de eixos de cada construção que faz parte de uma (por id). */
  private power = new Map<number, PowerNetwork>();

  /**
   * `startArea` é o terreno da vila do jogador (por onde as carroças chegam ao armazém inicial);
   * sem ele, vale o tile do centro. A `area` de cada vilarejo serve do mesmo jeito.
   */
  constructor(
    private readonly grid: Grid,
    startCenter: { x: number; y: number } | null,
    start: { capacity: number; servants: number; stock: readonly ItemAmount[] } = GAME_DATA.start,
    villages: readonly { produces: readonly string[]; wants: readonly string[]; population: number; area?: Area }[] = [],
    startArea: Area | null = null,
  ) {
    this.home = startCenter;
    this.transport = new TransportNetwork(grid);
    this.villages = villages.map((v) => ({ produces: v.produces, wants: v.wants, population: v.population, result: null, requests: 0 }));
    this.villageAreas = villages.map((v) => v.area ?? null);
    const homeArea =
      startArea ?? (startCenter ? { left: Math.floor(startCenter.x), top: Math.floor(startCenter.y), width: 1, height: 1 } : null);
    this.cartWorld = {
      grid,
      isRoad: (x, y) => {
        const building = this.site?.buildingAt(x, y);
        return building !== null && building !== undefined && buildingDef(building.kind).road === true;
      },
      storage: (id) => this.storages.get(id),
      storageArea: (id) => {
        if (!this.storages.has(id)) return null;
        if (id === START_STORAGE_ID) return homeArea;
        const building = this.site?.all.find((b) => b.id === id);
        return building ? areaOf(building) : null;
      },
      village: (index) => this.villages[index],
      delivered: (item, amount) => this.count(`${VILLAGE_TARGET}:${item}`, amount),
      villageArea: (index) => this.villageAreas[index] ?? null,
    };
    if (startCenter) {
      const items = new Map(start.stock.map(({ item, amount }) => [item, amount]));
      this.storages.set(START_STORAGE_ID, createStorage(startCenter, start.capacity, items));
      for (let i = 0; i < start.servants; i++) this.servants.push(new Servant(startCenter.x, startCenter.y));
    }
  }

  /** Acompanha as construções do terreno: cria o estado das novas e descarta o das removidas. */
  sync(site: BuildingSite): void {
    this.site = site;
    const alive = new Set<number>([START_STORAGE_ID]);
    const segments: Segment[] = [];
    const yards = new Map<number, { area: Area; def: NonNullable<BuildingDef['carts']> }>();
    for (const building of site.all) {
      alive.add(building.id);
      const def = buildingDef(building.kind);
      const center = buildingCenter(building);
      if (def.carts) yards.set(building.id, { area: areaOf(building), def: def.carts });
      if (def.sink) {
        const far = !this.home || Math.hypot(this.home.x - center.x, this.home.y - center.y) > TOWN_RANGE;
        const sink = this.sinks.get(building.id);
        if (sink) sink.far = far;
        else this.sinks.set(building.id, { kind: building.kind, item: def.sink.item, far, delivered: 0, lastDeliveryTick: -Infinity });
      }
      if (def.transport) segments.push(new Segment(building.id, building.x, building.y, building.rotation, def.transport));
      const storage = this.storages.get(building.id);
      if (storage) storage.center = center;
      else if (def.storage) this.storages.set(building.id, createStorage(center, def.storage.capacity));
      const recipes = recipesFor(building.kind);
      const machine = this.machines.get(building.id);
      if (machine) machine.center = center;
      else if (recipes.length > 0) {
        const created = new Machine(center, recipes[0] ?? null);
        created.onCraft = (outputs) => {
          for (const { item, amount } of outputs) this.count(`${PRODUCE_TARGET}:${item}`, amount);
        };
        this.machines.set(building.id, created);
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
          outputTile: null,
        });
      } else if (extractor) {
        // Girar muda a forma e, com ela, o terreno em volta.
        extractor.center = center;
        extractor.resourceTiles = countResourceTiles(this.grid, building, extractor.def.terrain);
      }
    }
    this.transport.rebuild(segments);
    this.connectToTransport(site);
    for (const id of this.storages.keys()) if (!alive.has(id)) this.storages.delete(id);
    for (const id of this.extractors.keys()) if (!alive.has(id)) this.extractors.delete(id);
    for (const id of this.sinks.keys()) if (!alive.has(id)) this.sinks.delete(id);
    for (const id of this.machines.keys()) {
      if (alive.has(id)) continue;
      this.machines.delete(id);
      this.machineKinds.delete(id);
    }
    this.cacheRanges();
    this.carts.sync(yards);
    this.connectPower(site);
  }

  /**
   * Armazéns ao alcance de cada máquina e extrator, calculados só quando as construções mudam.
   * As listas mudaram: toda máquina reavalia no próximo tick.
   */
  private cacheRanges(): void {
    this.ranges.clear();
    for (const [id, machine] of this.machines) {
      this.ranges.set(id, this.storagesInRange(machine.center));
      machine.wake();
    }
    for (const [id, extractor] of this.extractors) this.ranges.set(id, this.storagesInRange(extractor.center));
  }

  private rangeOf(id: number): readonly Storage[] {
    return this.ranges.get(id) ?? [];
  }

  /**
   * Liga máquinas e extratores às calhas e esteiras encostadas neles: a que sai da construção
   * recebe o produto; a que entra nela entrega insumos (e a máquina deixa de dormir).
   */
  private connectToTransport(site: BuildingSite): void {
    for (const building of site.all) {
      const machine = this.machines.get(building.id);
      const extractor = this.extractors.get(building.id);
      if (!machine && !extractor) continue;
      const { output, hasInput } = this.transportAround(building);
      if (extractor) extractor.outputTile = output;
      if (machine) {
        machine.connected = output !== null || hasInput;
        machine.emit = output ? (item) => this.transport.at(output.x, output.y)?.push(item) ?? false : null;
      }
    }
  }

  private transportAround(building: Building): { output: { x: number; y: number } | null; hasInput: boolean } {
    const { width, height } = footprint(building.kind, building.rotation);
    const inside = (x: number, y: number) =>
      x >= building.x && x < building.x + width && y >= building.y && y < building.y + height;
    let output: { x: number; y: number } | null = null;
    let hasInput = false;
    for (let y = building.y - 1; y <= building.y + height; y++) {
      for (let x = building.x - 1; x <= building.x + width; x++) {
        const diagonal = (x < building.x || x >= building.x + width) && (y < building.y || y >= building.y + height);
        const segment = inside(x, y) || diagonal ? null : this.transport.at(x, y);
        if (!segment) continue;
        if (inside(segment.next.x, segment.next.y)) hasInput = true;
        else output ??= { x, y };
      }
    }
    return { output, hasInput };
  }

  /** Item chegando ao fim de uma calha ou esteira: entra na máquina ou no armazém daquele tile. */
  private receive(x: number, y: number, item: string): boolean {
    const building = this.site?.buildingAt(x, y);
    if (!building) return false;
    const sink = this.sinks.get(building.id);
    if (sink) return this.deliver(sink, item);
    const machine = this.machines.get(building.id);
    if (machine) {
      const accepted = machine.accept(item);
      if (accepted) this.count(`${building.kind}:${item}`, 1);
      return accepted;
    }
    const storage = this.storages.get(building.id);
    if (!storage || freeSpace(storage) <= 0) return false;
    add(storage, item, 1);
    return true;
  }

  /** Fonte recebe só o item dela e só perto da vila; cada um conta para os decretos. */
  private deliver(sink: Sink, item: string): boolean {
    if (sink.far || item !== sink.item) return false;
    sink.delivered++;
    sink.lastDeliveryTick = this.ticks;
    this.count(`${sink.kind}:${item}`, 1);
    return true;
  }

  private count(key: string, amount: number): void {
    this.deliveries.set(key, (this.deliveries.get(key) ?? 0) + amount);
  }

  /**
   * Quanto de `item` já chegou em `target` desde o começo do jogo: um tipo de construção (por calha
   * ou esteira), VILLAGE_TARGET (vilarejos, por carroça) ou PRODUCE_TARGET (feito em qualquer lugar).
   */
  deliveredTo(target: string, item: string): number {
    return this.deliveries.get(`${target}:${item}`) ?? 0;
  }

  /** Refaz as redes de eixos e dá a velocidade de cada máquina (só quando as construções mudam). */
  private connectPower(site: BuildingSite): void {
    const parts = site.all.flatMap((building) => {
      const torque = buildingDef(building.kind).torque;
      if (!torque) return [];
      const { width, height } = footprint(building.kind, building.rotation);
      return [{ id: building.id, x: building.x, y: building.y, width, height, ...torque }];
    });
    this.power = buildNetworks(parts);
    for (const [id, machine] of this.machines) {
      const network = this.power.get(id);
      machine.speed = network?.powered ? TORQUE_SPEEDUP : 1;
    }
  }

  /** Construções do tipo com força da rede de eixos. */
  poweredCount(kind: string): number {
    return (this.site?.all ?? []).filter((b) => b.kind === kind && buildingDef(b.kind).torque?.need && this.power.get(b.id)?.powered).length;
  }

  /** Construções do tipo com o centro a até TOWN_RANGE do centro da vila. */
  builtNearTown(kind: string): number {
    const home = this.home;
    if (!home) return 0;
    return (this.site?.all ?? []).filter((b) => {
      if (b.kind !== kind) return false;
      const center = buildingCenter(b);
      return Math.hypot(center.x - home.x, center.y - home.y) <= TOWN_RANGE;
    }).length;
  }

  /** Quanto do item está guardado agora nos armazéns do tipo. */
  storedIn(kind: string, item: string): number {
    let total = 0;
    for (const building of this.site?.all ?? []) {
      if (building.kind === kind) total += this.storages.get(building.id)?.items.get(item) ?? 0;
    }
    return total;
  }

  /**
   * Colheita à mão: 1 do item que algum extrator tira desse terreno (madeira da floresta, pedra
   * da rocha...) vai para as mãos do camponês, até HAND_CAPACITY e um item por vez.
   */
  gatherByHand(x: number, y: number): string | null {
    if (!this.grid.isInside(x, y)) return null;
    const item = handGatherItem(this.grid.getTerrain(x, y));
    if (!item || this.hand.amount >= HAND_CAPACITY || (this.hand.item !== null && this.hand.item !== item)) return null;
    this.hand.item = item;
    this.hand.amount++;
    this.count(`${PRODUCE_TARGET}:${item}`, 1);
    return item;
  }

  /** O camponês larga o que carrega no armazém `storageId` (o que não couber fica nas mãos). */
  depositHand(storageId: number): number {
    const storage = this.storages.get(storageId);
    const { item } = this.hand;
    if (!storage || !item) return 0;
    const amount = Math.min(this.hand.amount, freeSpace(storage));
    add(storage, item, amount);
    this.hand.amount -= amount;
    if (this.hand.amount === 0) this.hand.item = null;
    return amount;
  }

  /**
   * Estado para salvar o jogo: o que guarda valor (estoques, ferramentas, rotas, escolhas e contas).
   * O que está a caminho (itens nas esteiras, cargas de servos e carroças, receita pela metade) se perde.
   */
  save(): EconomySave {
    const report = this.snapshot().buildings;
    const ids = (this.site?.all ?? []).map((b) => b.id);
    return {
      storages: [...this.storages].map(([id, storage]) => [id, [...storage.items]]),
      servants: this.servants.length,
      villages: this.villages.map((v) => v.population),
      hand: { ...this.hand },
      deliveries: [...this.deliveries],
      tools: [...this.extractors].flatMap(([id, e]) => (e.tool ? [[id, { ...e.tool }] as [number, HeldTool]] : [])),
      recipes: [...this.machines].flatMap(([id, m]) => (m.recipe ? [[id, m.recipe.id] as [number, string]] : [])),
      filters: ids.flatMap((id) => (report[id]?.filter ? [[id, report[id].filter] as [number, string]] : [])),
      routes: ids.flatMap((id) => (report[id]?.route ? [[id, report[id].route] as [number, CartRoute]] : [])),
    };
  }

  /** Devolve o estado salvo; chamar depois de sync() com as construções do jogo salvo. */
  restore(state: EconomySave): void {
    for (const [id, items] of state.storages) {
      const storage = this.storages.get(id);
      if (storage) storage.items = new Map(items.filter(([item]) => GAME_DATA.items.has(item)));
    }
    while (this.servants.length < state.servants && this.home) this.servants.push(new Servant(this.home.x, this.home.y));
    state.villages.forEach((population, index) => {
      const village = this.villages[index];
      if (village) village.population = population;
    });
    Object.assign(this.hand, state.hand);
    for (const [key, amount] of state.deliveries) this.deliveries.set(key, amount);
    for (const [id, tool] of state.tools) {
      const extractor = this.extractors.get(id);
      if (extractor) extractor.tool = { ...tool };
    }
    for (const [id, recipe] of state.recipes) this.setRecipe(id, recipe);
    for (const [id, item] of state.filters) this.setFilter(id, item);
    for (const [id, route] of state.routes) this.setCartRoute(id, route);
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

  /** Escolhe o item que um filtro manda em frente (null: o próximo que chegar). */
  setFilter(buildingId: number, item: string | null): boolean {
    return this.transport.setFilter(buildingId, item);
  }

  /**
   * Dá ao pátio `buildingId` uma rota em loop (null tira a rota e as carroças param onde estão).
   * Recusa rota impossível: ponta inexistente ou troca que o vilarejo não aceita (ver validRoute).
   */
  setCartRoute(buildingId: number, route: CartRoute | null): boolean {
    if (!this.carts.has(buildingId)) return false;
    if (route && (!GAME_DATA.items.has(route.item) || (route.back !== undefined && !GAME_DATA.items.has(route.back)))) return false;
    if (route && !validRoute(route, this.cartWorld)) return false;
    return this.carts.setRoute(buildingId, route);
  }

  /** Um tick: extratores avançam e entregam; máquinas acordadas puxam insumos e produzem. */
  step(): void {
    this.ticks++;
    this.transport.step((x, y, item) => this.receive(x, y, item));
    for (const [id, extractor] of this.extractors) this.stepExtractor(extractor, this.rangeOf(id));
    for (const [id, machine] of this.machines) machine.step(this.rangeOf(id));
    // Pedidos mudam devagar: recalcular a cada meio segundo basta e poupa a simulação.
    if (--this.ticksUntilDemands <= 0) {
      this.demands = this.collectDemands();
      this.ticksUntilDemands = DEMAND_INTERVAL_TICKS;
    }
    stepServants(this.servants, this.storages, this.demands);
    this.carts.step(this.cartWorld);
  }

  snapshot(): EconomySnapshot {
    const stock: Record<string, number> = {};
    const buildings: Record<number, BuildingReport> = {};
    for (const segment of this.transport.segments) {
      if (segment.def.sort === 'filter') buildings[segment.id] = { filter: segment.filter };
    }
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
    for (const [id, sink] of this.sinks) {
      const status = sink.far ? 'farFromTown' : this.ticks - sink.lastDeliveryTick <= SINK_ACTIVE_TICKS ? 'working' : 'dry';
      buildings[id] = { status, delivered: sink.delivered };
    }
    for (const [id, network] of this.power) {
      const report = buildings[id] ?? {};
      report.torque = { supply: network.supply, demand: network.demand, powered: network.powered };
      // Fontes e engrenagens só giram quando a rede move alguma máquina.
      if (!this.machines.has(id) && network.powered) report.status = 'working';
      buildings[id] = report;
    }
    for (const building of this.site?.all ?? []) {
      const report = this.carts.report(building.id);
      if (report) buildings[building.id] = report;
    }
    return {
      stock,
      buildings,
      servants: this.servants.map((s) => s.view()),
      villages: this.villages.map(({ population, result, requests }) => ({ population, result, requests })),
      segments: [...this.transport.segments].map((segment) => segment.view()),
      carts: this.carts.views(),
      hand: { ...this.hand },
    };
  }

  private stepExtractor(extractor: Extractor, storages: readonly Storage[]): void {
    if (extractor.resourceTiles === 0) {
      extractor.status = 'noResource';
      return;
    }
    const belt = extractor.outputTile && this.transport.at(extractor.outputTile.x, extractor.outputTile.y);
    if (storages.length === 0 && !belt) {
      extractor.status = 'noStorage';
      return;
    }
    const required = extractor.def.tool;
    if (required && !extractor.tool) extractor.tool = this.takeTool(storages, required.kind, required.minTier);
    if (required && !extractor.tool) {
      extractor.status = 'noTool';
      return;
    }
    // Com esteira de saída o produto vai para ela; sem, para o armazém mais perto com espaço.
    const target = belt ? null : storages.find((s) => used(s) < s.capacity);
    if (belt ? !belt.canAccept() : !target) {
      extractor.status = 'storageFull';
      return;
    }

    extractor.status = 'working';
    extractor.progressTicks += this.toolTier(extractor.tool);
    if (extractor.progressTicks < extractor.def.seconds * TICKS_PER_SECOND) return;
    extractor.progressTicks = 0;
    this.count(`${PRODUCE_TARGET}:${extractor.def.item}`, 1);
    if (belt) belt.push(extractor.def.item);
    else if (target) add(target, extractor.def.item, 1);
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
    for (const [id, machine] of this.machines) {
      const recipe = machine.recipe;
      if (!recipe) continue;
      const storages = this.rangeOf(id);
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
      const tool = toolsOf(required.kind, required.minTier).find(({ item }) => this.totalStock(item) > 0);
      if (tool) request(extractor.center, tool.item, 1);
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
    const tools = toolsOf(kind, minTier);
    for (const storage of storages) {
      let best: ToolEntry | null = null;
      for (const tool of tools) {
        if ((storage.items.get(tool.item) ?? 0) <= 0) continue;
        if (!best || tool.tier > best.tier) best = tool;
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


/** Item que se colhe à mão num terreno: o do primeiro extrator que trabalha nele (ver construcoes.json). */
export function handGatherItem(terrain: number): string | null {
  for (const building of GAME_DATA.buildings.values()) {
    if (building.extracts?.terrain === terrain) return building.extracts.item;
  }
  return null;
}

/** Terreno ocupado pela construção, já com a forma girada. */
function areaOf(building: Building): Area {
  const { width, height } = footprint(building.kind, building.rotation);
  return { left: building.x, top: building.y, width, height };
}
