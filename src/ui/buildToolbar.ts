import { GAME_DATA } from '../core/data/data';
import type { BuildingKind, PlacementProblem } from '../core/world/buildings';

/** Ferramenta escolhida na barra: uma construção, remover, ou nada (modo normal). */
export type BuildTool = BuildingKind | 'remove' | null;

const PROBLEM_TEXT: Readonly<Record<PlacementProblem, string>> = {
  unknown: 'Construção desconhecida',
  outside: 'Fora do mapa',
  water: 'Não dá para construir na água',
  forest: 'Tem árvores aqui',
  occupied: 'Já tem uma construção aqui',
  reserved: 'Terreno de um vilarejo',
  needsWater: "A roda d'água precisa encostar na água",
  noResource: 'Não há o recurso por perto (madeira, pedra ou minério)',
};

const HELP = '[R] girar  [X] remover  [Esc] cancelar';

/** Barra de construção no rodapé: um botão por construção que já tem arte, mais o de remover. */
export class BuildToolbar {
  private readonly buttons = new Map<BuildingKind, HTMLButtonElement>();
  private readonly status: HTMLElement;

  constructor(element: HTMLElement, onSelect: (tool: BuildTool) => void) {
    const row = document.createElement('div');
    const buildable = [...GAME_DATA.buildings.values()].filter((b) => b.frame !== undefined);
    for (const { id: tool, name } of [...buildable, { id: 'remove', name: 'Remover' }]) {
      const button = document.createElement('button');
      button.textContent = name;
      button.addEventListener('click', () => onSelect(button.classList.contains('active') ? null : tool));
      this.buttons.set(tool, button);
      row.appendChild(button);
    }
    this.status = document.createElement('div');
    this.status.className = 'status';
    element.replaceChildren(row, this.status);
    this.setTool(null);
  }

  setTool(tool: BuildTool): void {
    for (const [key, button] of this.buttons) button.classList.toggle('active', key === tool);
    this.status.textContent = tool ? HELP : 'Escolha o que construir';
  }

  /** Mostra por que não dá para construir no lugar do cursor (ou a ajuda, se der). */
  setProblem(problem: PlacementProblem | null): void {
    this.status.textContent = problem ? PROBLEM_TEXT[problem] : HELP;
    this.status.classList.toggle('blocked', problem !== null);
  }
}
