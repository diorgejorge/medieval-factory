import decreeTexts from '../../data/texto/pt-BR/decretos.json';
import { TICKS_PER_SECOND } from '../core/config';
import { GAME_DATA, UI_TEXT } from '../core/data/data';
import { goalItem } from '../core/data/gameData';
import { fillText, quoteText } from '../core/data/interfaceText';
import type { DecreeView } from '../core/decrees';
import { favorLetter, letterElements, openingLetter } from './kingLetters';

const TEXT = UI_TEXT.decree;

interface DecreeText {
  id: string;
  title: string;
  letter: string;
  success: string;
  failure: string;
}

function textOf(id: string): DecreeText | undefined {
  return (decreeTexts.decrees as DecreeText[]).find((d) => d.id === id);
}

function minutesLeft(ticks: number): string {
  return fillText(TEXT.minutes, { minutos: Math.ceil(ticks / TICKS_PER_SECOND / 60) });
}

/** Linhas do decreto no HUD: título, entregue/quantidade, prazo e favor. */
export function decreeLines(decree: DecreeView): string {
  const favor = fillText(TEXT.favor, { favor: decree.favor });
  const text = decree.id ? textOf(decree.id) : undefined;
  if (!decree.id) return favor;
  return [
    fillText(TEXT.title, { titulo: text?.title ?? decree.id }),
    fillText(TEXT.progress, { entregue: decree.delivered, quantidade: decree.amount }),
    fillText(TEXT.timeLeft, { prazo: minutesLeft(decree.ticksLeft) }),
    favor,
  ].join('\n');
}

/**
 * Carta do rei no painel quando chega um decreto novo, com o resultado do anterior em cima.
 * Fecha com Esc, como o aviso de era.
 */
export function showDecreeNotice(element: HTMLElement, decree: DecreeView, withResult: boolean): void {
  const parts: HTMLElement[] = [];
  const p = (text: string, className = '') => {
    const node = document.createElement('p');
    node.textContent = text;
    node.className = className;
    parts.push(node);
  };
  const last = decree.last ? textOf(decree.last.id) : undefined;
  const lastDef = decree.last ? GAME_DATA.challenges.decrees.find((d) => d.id === decree.last?.id) : undefined;
  if (withResult && decree.last && last) {
    const reward = fillText(TEXT.favor, { favor: `+${lastDef?.reward.favor ?? 0}` });
    p(fillText(decree.last.success ? last.success : last.failure, { recompensa: reward }), decree.last.success ? '' : 'warning');
  }
  const favor = withResult && decree.last ? favorLetter(decree.favor, decree.last.success) : null;
  if (favor) parts.push(...letterElements(favor, { favor: decree.favor }));
  const opening = decree.id ? openingLetter(decree.cycle) : null;
  if (opening) parts.push(...letterElements(opening));
  const text = decree.id ? textOf(decree.id) : undefined;
  const def = GAME_DATA.challenges.decrees.find((d) => d.id === decree.id);
  if (text && def) {
    const title = document.createElement('h2');
    title.textContent = fillText(TEXT.title, { titulo: text.title });
    parts.push(title);
    const itemId = goalItem(def.goal) ?? '';
    const item = GAME_DATA.items.get(itemId)?.name ?? itemId;
    p(quoteText(UI_TEXT, fillText(text.letter, { quantidade: def.goal.amount, item })), 'quote');
    p(fillText(TEXT.progress, { entregue: decree.delivered, quantidade: decree.amount }));
    p(fillText(TEXT.timeLeft, { prazo: minutesLeft(decree.ticksLeft) }));
  }
  if (parts.length === 0) return;
  p(UI_TEXT.common.close, 'hint');
  element.replaceChildren(...parts);
  element.hidden = false;
  const close = (event: KeyboardEvent) => {
    if (event.code !== 'Escape') return;
    element.hidden = true;
    window.removeEventListener('keydown', close);
  };
  window.addEventListener('keydown', close);
}
