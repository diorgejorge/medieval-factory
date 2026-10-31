import { GAME_DATA } from '../core/data/data';
import type { EconomySnapshot } from '../core/economy/economy';
import { RECRUIT_FOOD, TRADE_AMOUNT, type VillageResult } from '../core/economy/villageTrade';
import type { Village, VillageGood } from '../core/world/villages';

function label(item: VillageGood): string {
  return GAME_DATA.items.get(item)?.name ?? item;
}

/** Falas do Roteiro (data/texto/pt-BR/vilarejos.json), por temperamento. */
export interface Temperament {
  greeting: string;
  request: string;
  tradeAccepted: string;
  tradeRefused: string;
  recruit: string;
}

export interface VillageActions {
  trade: (village: number, give: string, receive: string) => void;
  recruit: (village: number) => void;
}

/**
 * Painel do vilarejo: nome, população, produção e pedidos, com botões de troca e de recrutar.
 * A resposta do vilarejo usa as falas do temperamento dele.
 */
export class VillagePanel {
  private openIndex: number | null = null;
  private village: Village | null = null;
  private readonly info = document.createElement('div');
  private readonly actions = document.createElement('div');
  /** Pedidos já feitos quando o painel abriu: respostas antigas não aparecem de novo. */
  private requestsAtOpen = 0;

  constructor(
    private readonly element: HTMLElement,
    private readonly temperaments: readonly Temperament[],
    private readonly onAction: VillageActions,
  ) {
    window.addEventListener('keydown', (event) => {
      if (event.code === 'Escape') this.hide();
    });
  }

  show(village: Village, index: number, economy: EconomySnapshot | undefined): void {
    this.openIndex = index;
    this.village = village;
    this.requestsAtOpen = economy?.villages[index]?.requests ?? 0;
    this.actions.replaceChildren(...this.buildButtons(village, index));
    this.element.replaceChildren(this.info, this.actions);
    this.refresh(economy);
    this.element.hidden = false;
  }

  hide(): void {
    if (this.openIndex === null) return;
    this.openIndex = null;
    this.element.hidden = true;
  }

  refresh(economy: EconomySnapshot | undefined): void {
    const village = this.village;
    if (this.openIndex === null || !village) return;
    const state = economy?.villages[this.openIndex];
    const temperament = this.temperaments[village.temperament];
    const fill = (text: string, item = '') => text.replaceAll('{vilarejo}', village.name).replaceAll('{item}', item);
    const firstWant = village.wants[0];
    const lines = [
      el('h2', village.name),
      el('p', temperament ? `“${fill(temperament.greeting)}”` : '', 'quote'),
      el('p', `População: ${state?.population ?? village.population}`),
      el('p', `Produz: ${village.produces.map(label).join(', ')}`),
      el('p', `Pede: ${village.wants.map(label).join(', ')}`),
    ];
    if (temperament && firstWant) {
      lines.push(el('p', `“${fill(temperament.request, label(firstWant).toLocaleLowerCase('pt-BR'))}”`, 'quote'));
    }
    if (state?.result && state.requests > this.requestsAtOpen && temperament) {
      lines.push(el('p', `“${fill(answer(temperament, state.result))}”`, state.result.endsWith('Refused') ? 'warning' : 'quote'));
    }
    this.info.replaceChildren(...lines);
  }

  private buildButtons(village: Village, index: number): HTMLElement[] {
    const buttons: HTMLElement[] = [];
    for (const give of village.wants) {
      for (const receive of village.produces) {
        buttons.push(
          button(`Dar ${TRADE_AMOUNT} ${label(give)} → receber ${TRADE_AMOUNT} ${label(receive)}`, () =>
            this.onAction.trade(index, give, receive),
          ),
        );
      }
    }
    buttons.push(button(`Recrutar um servo (${RECRUIT_FOOD} de comida)`, () => this.onAction.recruit(index)));
    buttons.push(el('p', '[Esc] fechar', 'hint'));
    return buttons;
  }
}

function answer(temperament: Temperament, result: VillageResult): string {
  switch (result) {
    case 'tradeAccepted':
      return temperament.tradeAccepted;
    case 'tradeRefused':
      return temperament.tradeRefused;
    case 'recruited':
      return temperament.recruit;
    case 'recruitRefused':
      return `Hoje ninguém de {vilarejo} vai: precisa de ${RECRUIT_FOOD} de comida e de gente sobrando.`;
  }
}

function button(text: string, onClick: () => void): HTMLElement {
  const element = document.createElement('button');
  element.textContent = text;
  element.addEventListener('click', onClick);
  return element;
}

function el(tag: string, text: string, className?: string): HTMLElement {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}
