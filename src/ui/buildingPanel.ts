import { GAME_DATA, UI_TEXT } from '../core/data/data';
import { fillText } from '../core/data/interfaceText';
import type { BuildingReport, EconomySnapshot, ExtractorStatus } from '../core/economy/economy';
import type { MachineStatus } from '../core/economy/machines';

/** Um texto por status (interface.json); o tipo garante que nenhum status fica sem texto. */
const STATUS_TEXT: Readonly<Record<ExtractorStatus | MachineStatus, string>> = UI_TEXT.buildingStatus;
const TEXT = UI_TEXT.buildingPanel;

/** "2 Trigo → 1 Farinha", montado dos dados (receitas não têm nome próprio). */
export function describeRecipe(recipeId: string): string {
  const recipe = GAME_DATA.recipes.get(recipeId);
  if (!recipe) return recipeId;
  const list = (amounts: readonly { item: string; amount: number }[]) =>
    amounts
      .map(({ item, amount }) => fillText(TEXT.recipeItem, { quantidade: amount, item: itemName(item) }))
      .join(TEXT.recipeItemSeparator);
  // " ou " entre combustíveis ainda não tem chave no interface.json.
  const fuel = recipe.fuel ? fillText(TEXT.recipeFuel, { combustiveis: recipe.fuel.map(itemName).join(' ou ') }) : '';
  return fillText(TEXT.recipeFormat, { entradas: list(recipe.inputs), saidas: list(recipe.outputs) }) + fuel;
}

export function itemName(item: string): string {
  return GAME_DATA.items.get(item)?.name ?? item;
}

/** Lista "Madeira 20 · Pedra 10" para o HUD e os painéis. */
export function formatItems(items: Readonly<Record<string, number>>): string {
  const entries = Object.entries(items).filter(([, amount]) => amount > 0);
  const { itemAmount, itemSeparator, empty } = UI_TEXT.common;
  if (entries.length === 0) return empty;
  return entries.map(([item, amount]) => fillText(itemAmount, { item: itemName(item), quantidade: amount })).join(itemSeparator);
}

/**
 * Painel de uma construção do jogador (ou da vila inicial, que é o primeiro armazém).
 * Fica aberto e se atualiza a cada snapshot até clicar fora ou apertar Esc.
 */
export class BuildingPanel {
  private openId: number | null = null;
  private title = '';
  private readonly info = document.createElement('div');
  private readonly recipeButtons = document.createElement('div');
  private recipesKey = '';

  constructor(
    private readonly element: HTMLElement,
    private readonly onSetRecipe: (buildingId: number, recipe: string) => void,
  ) {
    window.addEventListener('keydown', (event) => {
      if (event.code === 'Escape') this.hide();
    });
  }

  show(id: number, title: string, economy: EconomySnapshot | undefined): void {
    this.openId = id;
    this.title = title;
    this.recipesKey = '';
    this.element.replaceChildren(this.info, this.recipeButtons);
    this.refresh(economy);
    this.element.hidden = false;
  }

  hide(): void {
    if (this.openId === null) return;
    this.openId = null;
    this.element.hidden = true;
  }

  refresh(economy: EconomySnapshot | undefined): void {
    if (this.openId === null) return;
    const report: BuildingReport = economy?.buildings[this.openId] ?? {};
    const lines = [el('h2', this.title)];
    if (report.recipe) lines.push(el('p', fillText(TEXT.recipe, { receita: describeRecipe(report.recipe) })));
    if (report.progress !== undefined && report.status === 'working') {
      lines.push(el('p', fillText(TEXT.progress, { progresso: Math.round(report.progress * 100) })));
    }
    if (report.status) lines.push(el('p', STATUS_TEXT[report.status], report.status === 'working' ? '' : 'warning'));
    if (report.tool !== undefined) {
      const tool = report.tool
        ? fillText(TEXT.tool, { item: itemName(report.tool.item), usos: report.tool.usesLeft })
        : TEXT.toolNone;
      lines.push(el('p', tool));
    }
    if (report.items) {
      const total = Object.values(report.items).reduce((sum, amount) => sum + amount, 0);
      lines.push(
        el('p', fillText(TEXT.stored, { total, capacidade: report.capacity ?? 0 })),
        el('p', formatItems(report.items)),
      );
    }
    lines.push(el('p', UI_TEXT.common.close, 'hint'));
    this.info.replaceChildren(...lines);
    this.renderRecipeButtons(report);
  }

  /** Botões só são recriados quando a escolha muda, para o clique não se perder no meio da atualização. */
  private renderRecipeButtons(report: BuildingReport): void {
    const recipes = report.recipes ?? [];
    const key = `${this.openId}:${report.recipe}:${recipes.join()}`;
    if (key === this.recipesKey) return;
    this.recipesKey = key;
    const id = this.openId;
    const buttons = recipes.length > 1 ? recipes.map((recipe) => {
      const button = document.createElement('button');
      button.textContent = describeRecipe(recipe);
      button.classList.toggle('active', recipe === report.recipe);
      button.addEventListener('click', () => {
        if (id !== null) this.onSetRecipe(id, recipe);
      });
      return button;
    }) : [];
    this.recipeButtons.replaceChildren(...buttons);
  }
}

function el(tag: string, text: string, className = ''): HTMLElement {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}
