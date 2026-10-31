import { TICKS_PER_SECOND } from './config';
import type { ChallengesDef, DecreeDef, DecreeGoal } from './data/gameData';

/** O que a corte lê da economia para medir cada tipo de meta. */
export interface DeliveryCounter {
  /** Total já entregue (desde o começo do jogo) em `target`. */
  deliveredTo(target: string, item: string): number;
  /** Construções do tipo perto da vila. */
  builtNearTown(kind: string): number;
  /** Quanto do item está guardado agora em construções do tipo. */
  storedIn(kind: string, item: string): number;
  /** Construções do tipo com força da rede de eixos. */
  poweredCount(kind: string): number;
}

/** Estado da corte num jogo salvo. */
export interface CourtSave {
  cycle: number;
  current: string | null;
  baseline: number;
  ticksLeft: number;
  favor: number;
  last: { id: string; success: boolean } | null;
  finished: number;
  issued: number;
}

/** O que a tela mostra do decreto atual. */
export interface DecreeView {
  /** Id do decreto (textos em data/texto/pt-BR/decretos.json); null = nenhum decreto para esta era. */
  id: string | null;
  /** Conta os ciclos: muda quando chega um decreto novo (a tela mostra a carta). */
  cycle: number;
  delivered: number;
  amount: number;
  ticksLeft: number;
  favor: number;
  /** Como terminou o decreto anterior (null = ainda não houve). */
  last: { id: string; success: boolean } | null;
  /** Quantos decretos já terminaram: muda quando sai um resultado novo. */
  finished: number;
}

/**
 * A corte do rei: a cada ciclo manda um decreto da era atual. Só conta o que for entregue
 * depois que o decreto chegou. Cumprir dá favor e encerra o ciclo; o prazo acabar tira favor.
 */
export class KingCourt {
  private cycle = 0;
  private current: DecreeDef | null = null;
  private baseline = 0;
  private ticksLeft = 0;
  private favor: number;
  private last: DecreeView['last'] = null;
  private finished = 0;
  /** Quantos decretos já vieram: escolhe o próximo da lista, alternando os tipos. */
  private issued = 0;

  constructor(
    private readonly def: ChallengesDef,
    private readonly counter: DeliveryCounter,
  ) {
    this.favor = def.favor.start;
  }

  /** Estado para salvar o jogo (ver save.ts). */
  save(): CourtSave {
    const { cycle, baseline, ticksLeft, favor, last, finished, issued } = this;
    return { cycle, current: this.current?.id ?? null, baseline, ticksLeft, favor, last, finished, issued };
  }

  restore(state: CourtSave): void {
    Object.assign(this, { ...state, current: this.def.decrees.find((d) => d.id === state.current) ?? null });
  }

  private get cycleTicks(): number {
    return Math.round(this.def.cycleSeconds * TICKS_PER_SECOND);
  }

  step(era: number): void {
    if (this.ticksLeft <= 0) {
      if (this.current) this.finish(false);
      this.issue(era);
      return;
    }
    this.ticksLeft--;
    if (this.current && this.delivered() >= this.current.goal.amount) this.finish(true);
  }

  view(): DecreeView {
    return {
      id: this.current?.id ?? null,
      cycle: this.cycle,
      delivered: Math.min(this.delivered(), this.current?.goal.amount ?? 0),
      amount: this.current?.goal.amount ?? 0,
      ticksLeft: this.ticksLeft,
      favor: this.favor,
      last: this.last,
      finished: this.finished,
    };
  }

  private delivered(): number {
    return this.current ? this.measure(this.current.goal) - this.baseline : 0;
  }

  /** Entregas contam a partir do decreto (linha de base); construções e estoque contam o que há agora. */
  private measure(goal: DecreeGoal): number {
    switch (goal.kind) {
      case 'deliver':
        return this.counter.deliveredTo(goal.to, goal.deliver);
      case 'build':
        return this.counter.builtNearTown(goal.build);
      case 'stock':
        return this.counter.storedIn(goal.in, goal.stock);
      case 'powered':
        return this.counter.poweredCount(goal.powered);
    }
  }

  private finish(success: boolean): void {
    if (!this.current) return;
    const change = success ? this.current.reward.favor : -this.current.penalty.favor;
    this.favor = Math.max(0, Math.min(this.def.favor.max, this.favor + change));
    this.last = { id: this.current.id, success };
    this.finished++;
    this.current = null;
    // Cumprido antes do prazo: o resto do ciclo fica sem decreto, o próximo vem no ciclo seguinte.
  }

  /** Novo ciclo: o próximo decreto das eras já abertas, de tipo diferente do anterior se der. */
  private issue(era: number): void {
    const open = this.def.decrees.filter((d) => d.era <= era);
    const previous = this.last ? this.def.decrees.find((d) => d.id === this.last?.id) : undefined;
    const pool = open.filter((d) => d.type !== previous?.type);
    const choices = pool.length > 0 ? pool : open;
    this.current = choices.length > 0 ? (choices[this.issued % choices.length] ?? null) : null;
    this.issued++;
    this.cycle++;
    this.ticksLeft = this.cycleTicks;
    this.baseline = this.current?.goal.kind === 'deliver' ? this.measure(this.current.goal) : 0;
  }
}
