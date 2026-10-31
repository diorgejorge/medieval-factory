import erasText from '../../data/texto/pt-BR/eras.json';
import { UI_TEXT } from '../core/data/data';
import { fillText, quoteText } from '../core/data/interfaceText';
import { eraLetter, letterElements } from './kingLetters';

const ROMAN = ['', 'I', 'II', 'III', 'IV'];

export function eraName(era: number): string {
  const text = erasText.eras.find((entry) => entry.id === era);
  const numero = ROMAN[era] ?? String(era);
  // Era sem nome em eras.json: só o número (formato fixo, não há chave para ele).
  return text ? fillText(UI_TEXT.common.eraLabel, { numero, nome: text.name }) : `Era ${numero}`;
}

/** Anuncia a era nova no painel, com a introdução escrita pelo Roteiro. */
export function showEraNotice(element: HTMLElement, era: number): void {
  const text = erasText.eras.find((entry) => entry.id === era);
  const title = document.createElement('h2');
  title.textContent = eraName(era);
  const intro = document.createElement('p');
  intro.className = 'quote';
  intro.textContent = text ? quoteText(UI_TEXT, text.intro) : '';
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = UI_TEXT.eraNotice.hint;
  const letter = eraLetter(era);
  element.replaceChildren(title, intro, ...(letter ? letterElements(letter) : []), hint);
  element.hidden = false;
  const close = (event: KeyboardEvent) => {
    if (event.code !== 'Escape') return;
    element.hidden = true;
    window.removeEventListener('keydown', close);
  };
  window.addEventListener('keydown', close);
}
