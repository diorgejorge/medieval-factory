import { GAME_DATA } from '../core/data/data';
import type { BuildingReport, EconomySnapshot, ExtractorStatus } from '../core/economy/economy';

const STATUS_TEXT: Readonly<Record<ExtractorStatus, string>> = {
  working: 'Trabalhando',
  noTool: 'Parado: falta ferramenta no armazém',
  noStorage: 'Parado: nenhum armazém por perto',
  storageFull: 'Parado: armazém cheio',
  noResource: 'Parado: não há o recurso em volta',
};

export function itemName(item: string): string {
  return GAME_DATA.items.get(item)?.name ?? item;
}

/** Lista "Madeira 20 · Pedra 10" para o HUD e os painéis. */
export function formatItems(items: Readonly<Record<string, number>>): string {
  const entries = Object.entries(items).filter(([, amount]) => amount > 0);
  return entries.length > 0 ? entries.map(([item, amount]) => `${itemName(item)} ${amount}`).join(' · ') : 'vazio';
}

/**
 * Painel de uma construção do jogador (ou da vila inicial, que é o primeiro armazém).
 * Fica aberto e se atualiza a cada snapshot até clicar fora ou apertar Esc.
 */
export class BuildingPanel {
  private openId: number | null = null;
  private title = '';

  constructor(private readonly element: HTMLElement) {
    window.addEventListener('keydown', (event) => {
      if (event.code === 'Escape') this.hide();
    });
  }

  show(id: number, title: string, economy: EconomySnapshot | undefined): void {
    this.openId = id;
    this.title = title;
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
    if (report.status) lines.push(el('p', STATUS_TEXT[report.status], report.status === 'working' ? '' : 'warning'));
    if (report.tool !== undefined) {
      lines.push(el('p', report.tool ? `Ferramenta: ${itemName(report.tool.item)} (${report.tool.usesLeft} usos)` : 'Ferramenta: nenhuma'));
    }
    if (report.items) {
      const total = Object.values(report.items).reduce((sum, amount) => sum + amount, 0);
      lines.push(el('p', `Guardado: ${total} de ${report.capacity ?? 0}`), el('p', formatItems(report.items)));
    }
    lines.push(el('p', '[Esc] fechar', 'hint'));
    this.element.replaceChildren(...lines);
  }
}

function el(tag: string, text: string, className = ''): HTMLElement {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}
