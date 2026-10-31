import { GAME_DATA, UI_TEXT } from '../core/data/data';
import { fillText } from '../core/data/interfaceText';
import type { CartEndpoint, CartRoute } from '../core/economy/carts';

const TEXT = UI_TEXT.buildingPanel;

/** Uma ponta que o jogador pode escolher: armazém ou vilarejo, com o que o vilarejo troca. */
export interface RouteEndpointOption {
  endpoint: CartEndpoint;
  name: string;
  /** Só vilarejos: o que produzem e o que pedem. */
  produces?: readonly string[];
  wants?: readonly string[];
}

type Step = 'idle' | 'origin' | 'destination' | 'cargo';

function sameEndpoint(a: CartEndpoint, b: CartEndpoint): boolean {
  return 'storage' in a ? 'storage' in b && a.storage === b.storage : 'village' in b && a.village === b.village;
}

function itemName(item: string): string {
  return GAME_DATA.items.get(item)?.name ?? item;
}

/**
 * Escolha da rota do pátio das carroças em três passos: origem, destino e carga.
 * A volta sai sozinha do vilarejo: o que ele produz (se for o destino) ou o que ele pede (se for a origem).
 */
export class RoutePicker {
  readonly element = document.createElement('div');
  private step: Step = 'idle';
  private from: RouteEndpointOption | null = null;
  private to: RouteEndpointOption | null = null;
  private yardId: number | null = null;
  private route: CartRoute | null | undefined = undefined;
  /** Só redesenha quando algo muda, para o clique não se perder no meio da atualização. */
  private key = '';

  constructor(
    private readonly options: () => RouteEndpointOption[],
    private readonly onSetRoute: (buildingId: number, route: CartRoute) => void,
  ) {}

  /** Mostra a rota atual e os botões; `route` undefined = não é um pátio. */
  render(yardId: number | null, route: CartRoute | null | undefined): void {
    if (yardId !== this.yardId) {
      this.yardId = yardId;
      this.reset();
    }
    this.route = route;
    const key = `${yardId}:${this.step}:${JSON.stringify(route)}`;
    if (key === this.key) return;
    this.key = key;
    if (route === undefined || yardId === null) {
      this.element.replaceChildren();
      return;
    }
    this.element.replaceChildren(...this.lines(route), ...this.buttons(yardId));
  }

  private lines(route: CartRoute | null): HTMLElement[] {
    if (!route) return [paragraph(TEXT.routeNone)];
    return [
      paragraph(fillText(TEXT.route, { origem: this.nameOf(route.from), destino: this.nameOf(route.to) })),
      paragraph(fillText(TEXT.routeCargo, { item: itemName(route.item) })),
    ];
  }

  private nameOf(endpoint: CartEndpoint): string {
    return this.options().find((o) => sameEndpoint(o.endpoint, endpoint))?.name ?? '?';
  }

  private buttons(yardId: number): HTMLElement[] {
    if (this.step === 'idle') return [button(TEXT.routePickOrigin, () => this.go('origin'))];
    if (this.step === 'cargo') {
      return this.cargoChoices().map((item) =>
        button(fillText(TEXT.routeCargo, { item: itemName(item) }), () => this.finish(yardId, item)),
      );
    }
    const picking = this.step;
    return [
      paragraph(picking === 'origin' ? TEXT.routePickOrigin : TEXT.routePickDestination),
      ...this.options()
        .filter((o) => !this.from || picking === 'origin' || !sameEndpoint(o.endpoint, this.from.endpoint))
        .map((o) =>
          button(o.name, () => {
            if (picking === 'origin') this.from = o;
            else this.to = o;
            this.go(picking === 'origin' ? 'destination' : 'cargo');
          }),
        ),
    ];
  }

  /** Para vilarejo como destino, só o que ele pede; como origem, só o que ele produz. */
  private cargoChoices(): string[] {
    if (this.to?.wants) return [...this.to.wants];
    if (this.from?.produces) return [...this.from.produces];
    return [...GAME_DATA.items.keys()];
  }

  private finish(yardId: number, item: string): void {
    if (!this.from || !this.to) return;
    const back = this.to.produces?.[0] ?? this.from.wants?.[0];
    const route: CartRoute = { from: this.from.endpoint, to: this.to.endpoint, item };
    if (back) route.back = back;
    this.onSetRoute(yardId, route);
    this.go('idle');
  }

  private go(step: Step): void {
    if (step === 'idle') this.reset();
    else this.step = step;
    this.render(this.yardId, this.route);
  }

  private reset(): void {
    this.step = 'idle';
    this.from = null;
    this.to = null;
  }
}

function paragraph(text: string): HTMLElement {
  const element = document.createElement('p');
  element.textContent = text;
  return element;
}

function button(text: string, onClick: () => void): HTMLElement {
  const element = document.createElement('button');
  element.textContent = text;
  element.addEventListener('click', onClick);
  return element;
}
