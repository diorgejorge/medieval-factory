import { BUILDING_KINDS, type BuildingKind, type PlacementProblem } from '../core/world/buildings';

/** Ferramenta escolhida na barra: uma construção, remover, ou nada (modo normal). */
export type BuildTool = BuildingKind | 'remove' | null;

/** Nomes provisórios; viram dados em JSON junto com as construções (frente 7). */
const BUILDING_LABELS: Readonly<Record<BuildingKind, string>> = {
  oven: 'Forno',
  hut: 'Cabana',
  house: 'Casa',
  watermill: "Roda d'água",
};

const PROBLEM_TEXT: Readonly<Record<PlacementProblem, string>> = {
  outside: 'Fora do mapa',
  water: 'Não dá para construir na água',
  forest: 'Tem árvores aqui',
  occupied: 'Já tem uma construção aqui',
  reserved: 'Terreno de um vilarejo',
  needsWater: "A roda d'água precisa encostar na água",
};

const HELP = '[R] girar  [X] remover  [Esc] cancelar';

/** Barra de construção no rodapé: um botão por construção, mais o de remover. */
export class BuildToolbar {
  private readonly buttons = new Map<Exclude<BuildTool, null>, HTMLButtonElement>();
  private readonly status: HTMLElement;

  constructor(element: HTMLElement, onSelect: (tool: BuildTool) => void) {
    const row = document.createElement('div');
    for (const tool of [...BUILDING_KINDS, 'remove'] as const) {
      const button = document.createElement('button');
      button.textContent = tool === 'remove' ? 'Remover' : BUILDING_LABELS[tool];
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
