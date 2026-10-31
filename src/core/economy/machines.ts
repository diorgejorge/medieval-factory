import { TICKS_PER_SECOND } from '../config';
import { GAME_DATA } from '../data/data';
import type { ItemAmount, RecipeDef } from '../data/gameData';
import { add, available, freeSpace, take, type Storage } from './storage';

export type MachineStatus = 'working' | 'noRecipe' | 'noInput' | 'noFuel' | 'noStorage' | 'outputFull';

/** Receitas que uma construção sabe fazer, na ordem do JSON (a primeira é a padrão). */
export function recipesFor(buildingKind: string): RecipeDef[] {
  return [...GAME_DATA.recipes.values()].filter((recipe) => recipe.building === buildingKind);
}

/**
 * Máquina: puxa insumos e combustível dos armazéns ao alcance, trabalha `seconds` e devolve o produto.
 * Parada por falta de algo, ela "dorme" e só reavalia quando algum armazém muda (sistema dormente).
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

  constructor(
    readonly center: { x: number; y: number },
    public recipe: RecipeDef | null,
  ) {}

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

  /** Um tick. `storages` = armazéns ao alcance, do mais perto ao mais longe; `version` muda a cada alteração neles. */
  step(storages: readonly Storage[], version: number): void {
    if (this.sleptAt === version) return;
    this.sleptAt = -1;
    const recipe = this.recipe;
    if (!recipe) return this.sleep('noRecipe', version);
    if (storages.length === 0) return this.sleep('noStorage', version);
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

  isSleeping(version: number): boolean {
    return this.sleptAt === version;
  }

  private sleep(status: MachineStatus, version: number): void {
    this.status = status;
    this.sleptAt = version;
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

  /** Entrega o produto pronto no armazém mais perto que tenha espaço para tudo. */
  private deliver(storages: readonly Storage[]): boolean {
    const total = this.pending.reduce((sum, { amount }) => sum + amount, 0);
    const target = storages.find((storage) => freeSpace(storage) >= total);
    if (!target) return false;
    for (const { item, amount } of this.pending) add(target, item, amount);
    this.pending = [];
    return true;
  }
}
