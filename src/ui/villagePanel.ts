import { GAME_DATA, UI_TEXT } from '../core/data/data';
import { fillText, quoteText } from '../core/data/interfaceText';
import type { EconomySnapshot } from '../core/economy/economy';
import { RECRUIT_FOOD, TRADE_AMOUNT, type VillageResult } from '../core/economy/villageTrade';
import type { Village, VillageGood } from '../core/world/villages';

const TEXT = UI_TEXT.villagePanel;

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
  /** Apresentação do vilarejo; {item} = o primeiro que ele produz. */
  info: string;
  /** Saudação de quem já foi visitado. */
  idle: string;
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
  /** Vilarejos já visitados: na volta, a saudação curta (idle) no lugar da primeira. */
  private readonly visited = new Set<number>();
  private greetIdle = false;

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
    this.greetIdle = this.visited.has(index);
    this.visited.add(index);
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
    // Fala do vilarejo já entre as aspas do interface.json.
    const fill = (text: string, item = '') =>
      quoteText(UI_TEXT, text.replaceAll('{vilarejo}', village.name).replaceAll('{item}', item));
    const list = (goods: readonly VillageGood[]) => goods.map(label).join(UI_TEXT.common.listSeparator);
    const firstWant = village.wants[0];
    const lines = [
      el('h2', village.name),
      el('p', temperament ? fill(this.greetIdle ? temperament.idle : temperament.greeting) : '', 'quote'),
      el('p', fillText(TEXT.population, { populacao: state?.population ?? village.population })),
      el('p', fillText(TEXT.produces, { itens: list(village.produces) })),
      el('p', fillText(TEXT.wants, { itens: list(village.wants) })),
    ];
    const firstProduct = village.produces[0];
    if (temperament && firstProduct && !this.greetIdle) {
      lines.push(el('p', fill(temperament.info, label(firstProduct).toLocaleLowerCase('pt-BR')), 'quote'));
    }
    if (temperament && firstWant) {
      lines.push(el('p', fill(temperament.request, label(firstWant).toLocaleLowerCase('pt-BR')), 'quote'));
    }
    if (state?.result && state.requests > this.requestsAtOpen && temperament) {
      lines.push(el('p', fill(answer(temperament, state.result)), state.result.endsWith('Refused') ? 'warning' : 'quote'));
    }
    this.info.replaceChildren(...lines);
  }

  private buildButtons(village: Village, index: number): HTMLElement[] {
    const buttons: HTMLElement[] = [];
    for (const give of village.wants) {
      for (const receive of village.produces) {
        buttons.push(
          button(fillText(TEXT.trade, { quantidade: TRADE_AMOUNT, dar: label(give), receber: label(receive) }), () =>
            this.onAction.trade(index, give, receive),
          ),
        );
      }
    }
    buttons.push(button(fillText(TEXT.recruit, { comida: RECRUIT_FOOD }), () => this.onAction.recruit(index)));
    buttons.push(el('p', UI_TEXT.common.close, 'hint'));
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
      // {vilarejo} fica para o `fill` do painel, como nas falas do temperamento.
      return fillText(TEXT.recruitRefused, { comida: RECRUIT_FOOD });
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
