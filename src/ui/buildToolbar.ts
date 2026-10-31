import { CATEGORY_NAMES, DESCRIPTIONS, GAME_DATA, UI_TEXT } from '../core/data/data';
import { BUILDING_CATEGORIES, type BuildingCategory } from '../core/data/gameData';
import type { BuildingKind, PlacementProblem } from '../core/world/buildings';

/** Ferramenta escolhida na barra: uma construção, remover, ou nada (modo normal). */
export type BuildTool = BuildingKind | 'remove' | null;

/** Um texto por problema (interface.json); o tipo garante que nenhum problema fica sem texto. */
const PROBLEM_TEXT: Readonly<Record<PlacementProblem, string>> = UI_TEXT.placement;
const TEXT = UI_TEXT.toolbar;

/**
 * Barra de construção no rodapé: um botão por categoria, mais o de remover. Clicar numa
 * categoria abre a fileira com as construções dela que já têm arte; clicar de novo fecha.
 */
export class BuildToolbar {
  private readonly buttons = new Map<BuildingKind, HTMLButtonElement>();
  private readonly eras = new Map<BuildingKind, number>();
  private readonly categoryButtons = new Map<BuildingCategory, HTMLButtonElement>();
  private readonly options = new Map<BuildingCategory, HTMLElement>();
  private readonly categoryOf = new Map<BuildingKind, BuildingCategory>();
  private readonly status: HTMLElement;
  private era = 1;
  private open: BuildingCategory | null = null;

  constructor(element: HTMLElement, onSelect: (tool: BuildTool) => void) {
    const categories = document.createElement('div');
    categories.className = 'categories';
    const select = (tool: BuildingKind, button: HTMLButtonElement): void =>
      onSelect(button.classList.contains('active') ? null : tool);

    for (const category of BUILDING_CATEGORIES) {
      const buildable = [...GAME_DATA.buildings.values()].filter((b) => b.frame !== undefined && b.category === category);
      if (buildable.length === 0) continue;
      const row = document.createElement('div');
      row.className = 'options';
      row.hidden = true;
      for (const { id, name, era } of buildable) {
        const button = document.createElement('button');
        button.textContent = name;
        button.addEventListener('click', () => select(id, button));
        this.buttons.set(id, button);
        this.eras.set(id, era);
        this.categoryOf.set(id, category);
        row.appendChild(button);
      }
      this.options.set(category, row);

      const button = document.createElement('button');
      button.className = 'category';
      button.textContent = CATEGORY_NAMES[category];
      button.addEventListener('click', () => this.openCategory(this.open === category ? null : category));
      this.categoryButtons.set(category, button);
      categories.appendChild(button);
    }

    const remove = document.createElement('button');
    remove.className = 'remove';
    remove.textContent = TEXT.remove;
    remove.addEventListener('click', () => select('remove', remove));
    this.buttons.set('remove', remove);
    categories.appendChild(remove);

    this.status = document.createElement('div');
    this.status.className = 'status';
    element.replaceChildren(...this.options.values(), categories, this.status);
    this.setTool(null);
  }

  /** Construções de eras futuras ficam travadas; a categoria só trava se todas estiverem. */
  setEra(era: number): void {
    this.era = era;
    for (const [tool, button] of this.buttons) {
      const needed = this.eras.get(tool) ?? 1;
      button.disabled = needed > era;
      // Travada, a dica diz quando abre; senão, a descrição do Roteiro.
      button.title = needed > era ? TEXT.lockedEra : (DESCRIPTIONS.buildings[tool] ?? '');
    }
    for (const [category, button] of this.categoryButtons) {
      const locked = [...this.categoryOf].every(([tool, c]) => c !== category || (this.eras.get(tool) ?? 1) > this.era);
      button.disabled = locked;
      button.title = locked ? TEXT.lockedEra : '';
    }
  }

  setTool(tool: BuildTool): void {
    for (const [key, button] of this.buttons) button.classList.toggle('active', key === tool);
    // A categoria da ferramenta escolhida (por clique ou atalho) fica aberta.
    if (tool && tool !== 'remove') this.openCategory(this.categoryOf.get(tool) ?? this.open);
    this.status.textContent = tool ? TEXT.help : TEXT.chooseBuilding;
    this.status.classList.remove('blocked');
  }

  /** Mostra por que não dá para construir no lugar do cursor (ou a ajuda, se der). */
  setProblem(problem: PlacementProblem | null): void {
    this.status.textContent = problem ? PROBLEM_TEXT[problem] : TEXT.help;
    this.status.classList.toggle('blocked', problem !== null);
  }

  private openCategory(category: BuildingCategory | null): void {
    this.open = category;
    for (const [key, row] of this.options) row.hidden = key !== category;
    for (const [key, button] of this.categoryButtons) button.classList.toggle('open', key === category);
  }
}
