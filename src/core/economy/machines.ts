import { TICKS_PER_SECOND } from '../config';
import { GAME_DATA } from '../data/data';
import type { ItemAmount, RecipeDef } from '../data/gameData';
import { add, available, createStorage, freeSpace, take, versionOf, type Storage } from './storage';

export type MachineStatus = 'working' | 'noRecipe' | 'noInput' | 'noFuel' | 'noStorage' | 'outputFull';

/** Receitas por construção, montadas uma vez (os dados não mudam durante o jogo). */
let recipesByBuilding: Map<string, readonly RecipeDef[]> | null = null;
const NO_RECIPES: readonly RecipeDef[] = [];

/** Receitas que uma construção sabe fazer, na ordem do JSON (a primeira é a padrão). */
export function recipesFor(buildingKind: string): readonly RecipeDef[] {
  if (!recipesByBuilding) {
    recipesByBuilding = new Map();
    for (const recipe of GAME_DATA.recipes.values()) {
      recipesByBuilding.set(recipe.building, [...(recipesByBuilding.get(recipe.building) ?? []), recipe]);
    }
  }
  return recipesByBuilding.get(buildingKind) ?? NO_RECIPES;
}

/**
 * Máquina: puxa insumos e combustível dos armazéns ao alcance, trabalha `seconds` e devolve o produto.
 * Parada por falta de algo, ela "dorme" e só reavalia quando algum armazém ao alcance (ou o buffer)
 * muda, ou quando as construções mudam (`wake`) — sistema dormente.
 */
export class Machine {
  status: MachineStatus = 'working';
  progressTicks = 0;
  /** Ticks de queima que sobram do último combustível. */
  fuelTicks = 0;
  private crafting = false;
  private pending: ItemAmount[] = [];
  /** Versão dos armazéns quando dormiu; -1 = acordada. */
  private sleptAt = -1;
  /** Insumos que chegaram por calha ou esteira, usados antes dos do armazém. */
  readonly buffer: Storage;
  /** Esteira de saída: o produto vai para ela em vez do armazém. */
  emit: ((item: string) => boolean) | null = null;
  /** Ligada a calhas ou esteiras: não dorme, porque a fila muda sem passar por armazém. */
  connected = false;

  constructor(
    public center: { x: number; y: number },
    public recipe: RecipeDef | null,
  ) {
    this.buffer = createStorage(center, Infinity);
  }

  /** Recebe um item de uma calha ou esteira, se a receita usa e ainda cabe (até 2 receitas de estoque). */
  accept(item: string): boolean {
    const recipe = this.recipe;
    if (!recipe) return false;
    const input = recipe.inputs.find((i) => i.item === item);
    const limit = input ? input.amount * 2 : recipe.fuel?.includes(item) ? 2 : 0;
    if ((this.buffer.items.get(item) ?? 0) >= limit) return false;
    add(this.buffer, item, 1);
    return true;
  }

  /** Troca a receita; o que estava em andamento se perde (os insumos já foram consumidos). */
  setRecipe(recipe: RecipeDef): void {
    this.recipe = recipe;
    this.crafting = false;
    this.progressTicks = 0;
    this.sleptAt = -1;
  }

  get progress(): number {
    return this.recipe && this.crafting ? this.progressTicks / (this.recipe.seconds * TICKS_PER_SECOND) : 0;
  }

  /**
   * Um tick. `inRange` = armazéns ao alcance, do mais perto ao mais longe; a lista só pode mudar
   * entre chamadas junto com um `wake()` (a máquina compara a soma das versões deles).
   */
  step(inRange: readonly Storage[]): void {
    const version = this.versionOf(inRange);
    if (this.sleptAt === version) return;
    this.sleptAt = -1;
    const recipe = this.recipe;
    if (!recipe) return this.sleep('noRecipe', version);
    if (inRange.length === 0 && !this.connected) return this.sleep('noStorage', version);
    const storages = [this.buffer, ...inRange];
    if (this.pending.length > 0 && !this.deliver(storages)) return this.sleep('outputFull', version);
    if (!this.crafting) {
      if (!recipe.inputs.every(({ item, amount }) => available(storages, item) >= amount)) {
        return this.sleep('noInput', version);
      }
      if (!this.hasFuel(recipe, storages)) return this.sleep('noFuel', version);
      for (const { item, amount } of recipe.inputs) take(storages, item, amount);
      this.crafting = true;
      this.progressTicks = 0;
    }
    if (recipe.fuel) {
      if (this.fuelTicks <= 0 && !this.burnFuel(recipe, storages)) return this.sleep('noFuel', version);
      this.fuelTicks--;
    }
    this.status = 'working';
    if (++this.progressTicks < recipe.seconds * TICKS_PER_SECOND) return;
    this.crafting = false;
    this.pending = recipe.outputs.map((output) => ({ ...output }));
    if (!this.deliver(storages)) this.status = 'outputFull';
  }

  isSleeping(inRange: readonly Storage[]): boolean {
    return this.sleptAt !== -1 && this.sleptAt === this.versionOf(inRange);
  }

  /** Reavalia no próximo tick (os armazéns ao alcance ou as ligações mudaram). */
  wake(): void {
    this.sleptAt = -1;
  }

  private versionOf(inRange: readonly Storage[]): number {
    return this.buffer.version + versionOf(inRange);
  }

  private sleep(status: MachineStatus, version: number): void {
    this.status = status;
    if (!this.connected) this.sleptAt = version;
  }

  private hasFuel(recipe: RecipeDef, storages: readonly Storage[]): boolean {
    return !recipe.fuel || this.fuelTicks > 0 || recipe.fuel.some((item) => available(storages, item) > 0);
  }

  /** Queima o primeiro combustível aceito que houver, na ordem da receita. */
  private burnFuel(recipe: RecipeDef, storages: readonly Storage[]): boolean {
    const fuel = recipe.fuel?.find((item) => available(storages, item) > 0);
    if (!fuel) return false;
    take(storages, fuel, 1);
    this.fuelTicks = (GAME_DATA.items.get(fuel)?.fuel ?? 0) * TICKS_PER_SECOND;
    return true;
  }

  /** Entrega o produto pronto: na esteira de saída, um por vez, ou no armazém mais perto com espaço para tudo. */
  private deliver(storages: readonly Storage[]): boolean {
    if (this.emit) {
      const next = this.pending.find((p) => p.amount > 0);
      if (next && this.emit(next.item)) next.amount--;
      this.pending = this.pending.filter((p) => p.amount > 0);
      return this.pending.length === 0;
    }
    const total = this.pending.reduce((sum, { amount }) => sum + amount, 0);
    const target = storages.find((storage) => storage !== this.buffer && freeSpace(storage) >= total);
    if (!target) return false;
    for (const { item, amount } of this.pending) add(target, item, amount);
    this.pending = [];
    return true;
  }
}
