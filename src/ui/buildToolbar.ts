import { GAME_DATA, UI_TEXT } from '../core/data/data';
import type { BuildingKind, PlacementProblem } from '../core/world/buildings';

/** Ferramenta escolhida na barra: uma construção, remover, ou nada (modo normal). */
export type BuildTool = BuildingKind | 'remove' | null;

/** Um texto por problema (interface.json); o tipo garante que nenhum problema fica sem texto. */
const PROBLEM_TEXT: Readonly<Record<PlacementProblem, string>> = UI_TEXT.placement;
const TEXT = UI_TEXT.toolbar;

/** Barra de construção no rodapé: um botão por construção que já tem arte, mais o de remover. */
export class BuildToolbar {
  private readonly buttons = new Map<BuildingKind, HTMLButtonElement>();
  private readonly eras = new Map<BuildingKind, number>();
  private readonly status: HTMLElement;

  constructor(element: HTMLElement, onSelect: (tool: BuildTool) => void) {
    const row = document.createElement('div');
    const buildable = [...GAME_DATA.buildings.values()].filter((b) => b.frame !== undefined);
    for (const { id: tool, name } of [...buildable, { id: 'remove', name: TEXT.remove }]) {
      const button = document.createElement('button');
      button.textContent = name;
      button.addEventListener('click', () => onSelect(button.classList.contains('active') ? null : tool));
      this.buttons.set(tool, button);
      if (tool !== 'remove') this.eras.set(tool, GAME_DATA.buildings.get(tool)?.era ?? 1);
      row.appendChild(button);
    }
    this.status = document.createElement('div');
    this.status.className = 'status';
    element.replaceChildren(row, this.status);
    this.setTool(null);
  }

  /** Construções de eras futuras ficam travadas na barra. */
  setEra(era: number): void {
    for (const [tool, button] of this.buttons) {
      const needed = this.eras.get(tool) ?? 1;
      button.disabled = needed > era;
      button.title = needed > era ? TEXT.lockedEra : '';
    }
  }

  setTool(tool: BuildTool): void {
    for (const [key, button] of this.buttons) button.classList.toggle('active', key === tool);
    this.status.textContent = tool ? TEXT.help : TEXT.chooseBuilding;
    this.status.classList.remove('blocked');
  }

  /** Mostra por que não dá para construir no lugar do cursor (ou a ajuda, se der). */
  setProblem(problem: PlacementProblem | null): void {
    this.status.textContent = problem ? PROBLEM_TEXT[problem] : TEXT.help;
    this.status.classList.toggle('blocked', problem !== null);
  }
}
