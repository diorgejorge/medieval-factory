import { GAME_DATA } from '../core/data/data';
import type { Village, VillageGood } from '../core/world/villages';

function label(item: VillageGood): string {
  return GAME_DATA.items.get(item)?.name ?? item;
}

export interface Temperament {
  greeting: string;
  request: string;
}

/** Painel com nome, população, produção e pedidos do vilarejo clicado. */
export class VillagePanel {
  constructor(
    private readonly element: HTMLElement,
    private readonly temperaments: readonly Temperament[],
  ) {
    window.addEventListener('keydown', (event) => {
      if (event.code === 'Escape') this.hide();
    });
  }

  show(village: Village): void {
    const temperament = this.temperaments[village.temperament];
    const fill = (text: string, item = '') => text.replaceAll('{vilarejo}', village.name).replaceAll('{item}', item);
    const firstWant = village.wants[0];

    this.element.replaceChildren(
      el('h2', village.name),
      el('p', temperament ? `“${fill(temperament.greeting)}”` : '', 'quote'),
      el('p', `População: ${village.population}`),
      el('p', `Produz: ${village.produces.map(label).join(', ')}`),
      el('p', `Pede: ${village.wants.map(label).join(', ')}`),
      el('p', temperament && firstWant ? `“${fill(temperament.request, label(firstWant).toLocaleLowerCase('pt-BR'))}”` : '', 'quote'),
      el('p', '[Esc] fechar', 'hint'),
    );
    this.element.hidden = false;
  }

  hide(): void {
    this.element.hidden = true;
  }
}

function el(tag: string, text: string, className?: string): HTMLElement {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}
