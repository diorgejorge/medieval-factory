import erasText from '../../data/texto/pt-BR/eras.json';

const ROMAN = ['', 'I', 'II', 'III', 'IV'];

export function eraName(era: number): string {
  const text = erasText.eras.find((entry) => entry.id === era);
  return `Era ${ROMAN[era] ?? era}${text ? `: ${text.name}` : ''}`;
}

/** Anuncia a era nova no painel, com a introdução escrita pelo Roteiro. */
export function showEraNotice(element: HTMLElement, era: number): void {
  const text = erasText.eras.find((entry) => entry.id === era);
  const title = document.createElement('h2');
  title.textContent = eraName(era);
  const intro = document.createElement('p');
  intro.className = 'quote';
  intro.textContent = text ? `“${text.intro}”` : '';
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = 'Novas construções na barra. [Esc] fechar';
  element.replaceChildren(title, intro, hint);
  element.hidden = false;
  const close = (event: KeyboardEvent) => {
    if (event.code !== 'Escape') return;
    element.hidden = true;
    window.removeEventListener('keydown', close);
  };
  window.addEventListener('keydown', close);
}
