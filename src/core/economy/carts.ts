import { TICKS_PER_SECOND } from '../config';
import type { BuildingDef } from '../data/gameData';
import type { Grid } from '../world/grid';
import { findPath, TRAIL_COST, type Tile } from '../world/pathfinding';
import type { Area } from '../world/villages';
import { add, freeSpace, type Storage } from './storage';
import type { VillageState } from './villageTrade';

/** Ponta de uma rota: um armazém (id da construção, ou START_STORAGE_ID) ou um vilarejo (índice no mapa). */
export type CartEndpoint = { storage: number } | { village: number };

/**
 * Rota em loop: a carroça carrega `item` em `from`, leva até `to` e, se houver `back`,
 * volta com ele de `to` para `from`.
 */
export interface CartRoute {
  from: CartEndpoint;
  to: CartEndpoint;
  item: string;
  back?: string;
}

/**
 * noRoute: sem rota; noEndpoint: uma das pontas sumiu; noPath: sem estrada até a próxima ponta;
 * moving: andando; noItems: esperando o item na origem; destinationFull: esperando espaço no destino.
 */
export type CartStatus = 'noRoute' | 'noEndpoint' | 'noPath' | 'moving' | 'noItems' | 'destinationFull';

export type CartDirection = 'e' | 's' | 'w' | 'n';

export interface CartView {
  id: number;
  /** Centro da carroça, em tiles (fracionário). */
  x: number;
  y: number;
  /** Para onde anda (a última direção, se parada). */
  dir: CartDirection;
  moving: boolean;
  item: string | null;
  amount: number;
  status: CartStatus;
}

/** O que as carroças enxergam da economia e do terreno. */
export interface CartWorld {
  grid: Grid;
  isRoad(x: number, y: number): boolean;
  storage(id: number): Storage | undefined;
  /** Terreno ocupado pelo armazém; null se ele não existe. */
  storageArea(id: number): Area | null;
  village(index: number): VillageState | undefined;
  villageArea(index: number): Area | null;
  /** Carroça entregou `amount` de `item` num vilarejo (conta para os decretos). */
  delivered?(item: string, amount: number): void;
}

/** Na estrada todo tile custa o mesmo, qualquer que seja o terreno embaixo. */
const ROAD_COST = Object.fromEntries(Object.keys(TRAIL_COST).map((terrain) => [terrain, 1])) as unknown as typeof TRAIL_COST;
/** Quantas entradas de cada ponta o A* testa (as mais perto da carroça). */
const MAX_ENTRIES = 4;
/** Parada esperando item ou espaço: tenta de novo a cada segundo. */
const RETRY_TICKS = TICKS_PER_SECOND;

class Cart {
  dir: CartDirection = 's';
  item: string | null = null;
  amount = 0;
  status: CartStatus = 'noRoute';
  /** Indo carregar em `from` ou entregar em `to`. */
  leg: 'toFrom' | 'toTo' = 'toFrom';
  /** Caminho em cache; null = recalcular (rota nova ou construções mudaram). */
  path: Tile[] | null = null;
  next = 0;
  waitTicks = 0;
  /** Já tentou e não achou caminho: só tenta de novo quando as construções mudarem. */
  stuck = false;

  constructor(
    readonly id: number,
    public x: number,
    public y: number,
  ) {}

  view(): CartView {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      dir: this.dir,
      moving: this.status === 'moving' && this.path !== null && this.next < this.path.length,
      item: this.amount > 0 ? this.item : null,
      amount: this.amount,
      status: this.status,
    };
  }

  restart(): void {
    this.leg = 'toFrom';
    this.path = null;
    this.stuck = false;
    this.waitTicks = 0;
  }
}

interface CartYard {
  area: Area;
  def: NonNullable<BuildingDef['carts']>;
  route: CartRoute | null;
  carts: Cart[];
}

/** Pátios e suas carroças. A economia sincroniza com as construções e chama `step` a cada tick. */
export class CartFleet {
  private readonly yards = new Map<number, CartYard>();
  private nextCartId = 1;

  /** `yards`: pátios atuais (id → terreno e definição). Pátios novos ganham carroças no centro. */
  sync(yards: ReadonlyMap<number, { area: Area; def: NonNullable<BuildingDef['carts']> }>): void {
    for (const id of this.yards.keys()) if (!yards.has(id)) this.yards.delete(id);
    for (const [id, { area, def }] of yards) {
      const yard = this.yards.get(id);
      if (yard) {
        yard.area = area;
        for (const cart of yard.carts) {
          cart.path = null;
          cart.stuck = false;
        }
        continue;
      }
      const carts = Array.from({ length: def.count }, () => new Cart(this.nextCartId++, area.left + area.width / 2, area.top + area.height / 2));
      this.yards.set(id, { area, def, route: null, carts });
    }
  }

  has(yardId: number): boolean {
    return this.yards.has(yardId);
  }

  setRoute(yardId: number, route: CartRoute | null): boolean {
    const yard = this.yards.get(yardId);
    if (!yard) return false;
    yard.route = route && { ...route };
    for (const cart of yard.carts) {
      cart.restart();
      cart.status = route ? 'moving' : 'noRoute';
    }
    return true;
  }

  report(yardId: number): { route: CartRoute | null; carts: CartView[] } | null {
    const yard = this.yards.get(yardId);
    return yard ? { route: yard.route && { ...yard.route }, carts: yard.carts.map((cart) => cart.view()) } : null;
  }

  views(): CartView[] {
    return [...this.yards.values()].flatMap((yard) => yard.carts.map((cart) => cart.view()));
  }

  step(world: CartWorld): void {
    for (const yard of this.yards.values()) {
      if (!yard.route) continue;
      for (const cart of yard.carts) stepCart(cart, yard, yard.route, world);
    }
  }
}

/**
 * Confere uma rota: pontas diferentes e, nos vilarejos, troca possível.
 * Vilarejo como destino precisa querer `item` (e produzir `back`, se houver); como origem,
 * precisa produzir `item` e querer `back`, que paga a carga (sem `back` não há com que pagar).
 */
export function validRoute(route: CartRoute, world: Pick<CartWorld, 'storage' | 'village'>): boolean {
  if (sameEndpoint(route.from, route.to)) return false;
  const check = (endpoint: CartEndpoint, gives: string | undefined, takes: string | undefined): boolean => {
    if ('storage' in endpoint) return world.storage(endpoint.storage) !== undefined;
    const village = world.village(endpoint.village);
    if (!village) return false;
    if (takes !== undefined && !village.wants.includes(takes)) return false;
    return gives === undefined || village.produces.includes(gives);
  };
  const fromIsVillage = 'village' in route.from;
  if (fromIsVillage && route.back === undefined) return false;
  return check(route.from, route.item, route.back) && check(route.to, route.back, route.item);
}

function sameEndpoint(a: CartEndpoint, b: CartEndpoint): boolean {
  if ('storage' in a && 'storage' in b) return a.storage === b.storage;
  if ('village' in a && 'village' in b) return a.village === b.village;
  return false;
}

function stepCart(cart: Cart, yard: CartYard, route: CartRoute, world: CartWorld): void {
  if (cart.waitTicks > 0) {
    if (--cart.waitTicks === 0) arrive(cart, yard, route, world);
    return;
  }
  const target = cart.leg === 'toFrom' ? route.from : route.to;
  if (!cart.path) {
    if (cart.stuck) return;
    const area = endpointArea(target, world);
    if (!area) {
      cart.status = 'noEndpoint';
      cart.stuck = true;
      return;
    }
    cart.path = planPath(cart, yard.area, area, world);
    cart.next = 0;
    if (!cart.path) {
      cart.status = 'noPath';
      cart.stuck = true;
      return;
    }
    cart.status = 'moving';
  }
  if (move(cart, cart.path, yard.def.speed / TICKS_PER_SECOND)) arrive(cart, yard, route, world);
}

/**
 * Caminho pelas estradas do tile da carroça até uma estrada encostada (nos lados) no terreno
 * da ponta. Além das estradas, a carroça só passa pelo próprio pátio, de onde ela sai.
 */
function planPath(cart: Cart, yardArea: Area, target: Area, world: CartWorld): Tile[] | null {
  const start = { x: Math.floor(cart.x), y: Math.floor(cart.y) };
  const passable = (x: number, y: number) => world.isRoad(x, y) || inside(yardArea, x, y);
  const entries = entryTiles(target, world)
    .sort((a, b) => Math.abs(a.x - start.x) + Math.abs(a.y - start.y) - (Math.abs(b.x - start.x) + Math.abs(b.y - start.y)))
    .slice(0, MAX_ENTRIES);
  let best: Tile[] | null = null;
  for (const entry of entries) {
    const path = findPath(world.grid, start, entry, (x, y) => !passable(x, y), ROAD_COST);
    if (path && (!best || path.length < best.length)) best = path;
  }
  return best;
}

/** Estradas encostadas nos lados do terreno (cantos diagonais não valem). */
function entryTiles(area: Area, world: CartWorld): Tile[] {
  const tiles: Tile[] = [];
  const consider = (x: number, y: number) => {
    if (world.grid.isInside(x, y) && world.isRoad(x, y)) tiles.push({ x, y });
  };
  for (let x = area.left; x < area.left + area.width; x++) {
    consider(x, area.top - 1);
    consider(x, area.top + area.height);
  }
  for (let y = area.top; y < area.top + area.height; y++) {
    consider(area.left - 1, y);
    consider(area.left + area.width, y);
  }
  return tiles;
}

function inside(area: Area, x: number, y: number): boolean {
  return x >= area.left && x < area.left + area.width && y >= area.top && y < area.top + area.height;
}

function endpointArea(endpoint: CartEndpoint, world: CartWorld): Area | null {
  return 'storage' in endpoint ? world.storageArea(endpoint.storage) : world.villageArea(endpoint.village);
}

/** Anda `step` tiles pelos centros dos tiles do caminho; devolve true ao chegar ao último. */
function move(cart: Cart, path: readonly Tile[], step: number): boolean {
  let left = step;
  while (cart.next < path.length) {
    const tile = path[cart.next] as Tile;
    const dx = tile.x + 0.5 - cart.x;
    const dy = tile.y + 0.5 - cart.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 0) cart.dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'e' : 'w') : dy > 0 ? 's' : 'n';
    if (distance > left) {
      cart.x += (dx / distance) * left;
      cart.y += (dy / distance) * left;
      return false;
    }
    cart.x = tile.x + 0.5;
    cart.y = tile.y + 0.5;
    left -= distance;
    cart.next++;
  }
  return true;
}

/**
 * Chegou à ponta: descarrega o que leva e carrega o item desta ponta (em `from`, `item`;
 * em `to`, `back`). Armazém: descarrega o que couber e carrega até a capacidade. Vilarejo:
 * fica com a carga se a quiser e, em troca, dá o mesmo tanto do que produz (1 por 1).
 * Espera (tentando a cada segundo) por espaço no destino ou, na origem armazém, pelo item.
 */
function arrive(cart: Cart, yard: CartYard, route: CartRoute, world: CartWorld): void {
  const atFrom = cart.leg === 'toFrom';
  const endpoint = atFrom ? route.from : route.to;
  const load = atFrom ? route.item : route.back;
  const capacity = yard.def.capacity;
  if ('storage' in endpoint) {
    const storage = world.storage(endpoint.storage);
    if (!storage) {
      cart.status = 'noEndpoint';
      cart.path = null;
      cart.stuck = true;
      return;
    }
    if (cart.amount > 0 && cart.item) {
      const dropped = Math.min(cart.amount, freeSpace(storage));
      add(storage, cart.item, dropped);
      cart.amount -= dropped;
      if (cart.amount > 0) return wait(cart, 'destinationFull');
    }
    if (load !== undefined) {
      const amount = Math.min(capacity, storage.items.get(load) ?? 0);
      if (amount > 0) {
        add(storage, load, -amount);
        cart.item = load;
        cart.amount = amount;
      }
    }
    if (atFrom && cart.amount === 0) return wait(cart, 'noItems');
  } else {
    const village = world.village(endpoint.village);
    if (village && cart.amount > 0 && cart.item && village.wants.includes(cart.item)) {
      const paid = cart.amount;
      world.delivered?.(cart.item, paid);
      cart.amount = 0;
      if (load !== undefined && village.produces.includes(load)) {
        cart.item = load;
        cart.amount = paid;
      }
    }
  }
  if (cart.amount === 0) cart.item = null;
  cart.leg = atFrom ? 'toTo' : 'toFrom';
  cart.path = null;
  cart.status = 'moving';
}

function wait(cart: Cart, status: CartStatus): void {
  cart.status = status;
  cart.waitTicks = RETRY_TICKS;
}
