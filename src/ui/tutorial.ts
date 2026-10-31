import tutorialText from '../../data/texto/pt-BR/tutorial.json';
import characters from '../../data/texto/pt-BR/personagens.json';
import { UI_TEXT } from '../core/data/data';
import { quoteText } from '../core/data/interfaceText';

/** O que o tutorial observa do jogo para saber se um passo terminou. */
export interface TutorialState {
  /** Tipos de construção que o jogador tem agora. */
  kinds: ReadonlySet<string>;
  /** Construções removidas desde o começo. */
  removed: number;
  /** A câmera saiu do lugar (andou ou mudou o zoom). */
  cameraMoved: boolean;
  villageOpened: boolean;
  /** Pausou ou mudou a velocidade. */
  timeChanged: boolean;
  /** Chegou alguma coisa para o decreto atual, ou um decreto já terminou. */
  decreeProgress: boolean;
}

/**
 * Quando cada passo de tutorial.json termina. Passo sem regra (cartas) termina com um clique.
 * O tipo garante que só há regra para ids que existem no texto do Roteiro (conferido nos testes).
 */
export const STEP_DONE: Readonly<Record<string, (state: TutorialState) => boolean>> = {
  'olhar-o-vale': (s) => s.cameraMoved,
  'primeiro-lenhador': (s) => s.kinds.has('lumberjack'),
  armazem: (s) => s.kinds.has('storage'),
  'primeira-pedreira': (s) => s.kinds.has('quarry'),
  bancada: (s) => s.kinds.has('workbench'),
  remover: (s) => s.removed > 0,
  'cadeia-do-pao': (s) => s.kinds.has('farm') && s.kinds.has('mill') && s.kinds.has('oven'),
  burro: (s) => s.kinds.has('cart_yard'),
  vilarejos: (s) => s.villageOpened,
  tempo: (s) => s.timeChanged,
  'primeiro-decreto': (s) => s.kinds.has('water_intake') && s.kinds.has('fountain') && s.decreeProgress,
};

const STORAGE_KEY = 'tutorial-step';

/** Quantos passos já foram feitos (fica no navegador; sem acesso, recomeça do zero). */
function loadStep(): number {
  try {
    return Number(localStorage.getItem(STORAGE_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function saveStep(step: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(step));
  } catch {
    // Sem armazenamento: o tutorial só não lembra o passo na próxima visita.
  }
}

/**
 * Tutorial da Era I: mostra um passo por vez (texto do Roteiro) e avança sozinho quando a
 * regra do passo é cumprida; cartas sem regra avançam com um clique na caixa.
 */
export class Tutorial {
  private step = loadStep();
  private shown = -1;

  constructor(private readonly element: HTMLElement) {
    element.addEventListener('click', () => {
      const id = this.current?.id;
      if (id && !STEP_DONE[id]) this.advance();
    });
  }

  private get current() {
    return tutorialText.steps[this.step];
  }

  update(state: TutorialState): void {
    const id = this.current?.id;
    if (id && STEP_DONE[id]?.(state)) this.advance();
    this.render();
  }

  private advance(): void {
    this.step++;
    saveStep(this.step);
    this.render();
  }

  private render(): void {
    if (this.shown === this.step) return;
    this.shown = this.step;
    const step = this.current;
    this.element.hidden = !step;
    if (!step) return;
    const speaker = characters.characters.find((c) => c.id === step.speaker);
    const title = document.createElement('h3');
    title.textContent = step.title;
    const text = document.createElement('p');
    text.className = 'quote';
    text.textContent = quoteText(UI_TEXT, step.text);
    const signed = document.createElement('p');
    signed.className = 'speaker';
    signed.textContent = speaker?.name ?? '';
    this.element.replaceChildren(title, text, signed);
  }
}
