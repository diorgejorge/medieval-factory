import letters from '../../data/texto/pt-BR/cartas-do-rei.json';
import characters from '../../data/texto/pt-BR/personagens.json';
import { UI_TEXT } from '../core/data/data';
import { fillText, quoteText } from '../core/data/interfaceText';

/** Cartas que abrem os ciclos, em rodízio (cartas-do-rei.json). */
const OPENINGS = ['abertura-ciclo-a', 'abertura-ciclo-b', 'abertura-ciclo-c'];
/** Carta de cada era nova. */
const ERA_LETTERS: Readonly<Record<number, string>> = { 2: 'era-ferro', 3: 'era-carvao', 4: 'era-vapor' };
/** Favor a partir do qual (ou até o qual) o rei manda carta depois de um decreto. */
export const HIGH_FAVOR = 75;
export const LOW_FAVOR = 25;

/** Carta do rei (ou de quem fala por ele) como elementos do painel: título, texto e quem assina. */
export function letterElements(id: string, values: Readonly<Record<string, string | number>> = {}): HTMLElement[] {
  const letter = letters.letters.find((l) => l.id === id);
  if (!letter) return [];
  const speaker = characters.characters.find((c) => c.id === letter.speaker);
  const title = document.createElement('h3');
  title.textContent = letter.title;
  const text = document.createElement('p');
  text.className = 'quote';
  text.textContent = quoteText(UI_TEXT, fillText(letter.text, values));
  const signed = document.createElement('p');
  signed.className = 'speaker';
  signed.textContent = speaker?.name ?? '';
  return [title, text, signed];
}

export function openingLetter(cycle: number): string | null {
  // O primeiro ciclo já abre com a carta do próprio decreto.
  return cycle > 1 ? (OPENINGS[(cycle - 2) % OPENINGS.length] ?? null) : null;
}

/** Depois de um decreto: favor zerado, baixo após falhar ou alto após cumprir. */
export function favorLetter(favor: number, success: boolean): string | null {
  if (favor === 0) return 'favor-zerado';
  if (!success && favor <= LOW_FAVOR) return 'favor-baixo';
  if (success && favor >= HIGH_FAVOR) return 'favor-alto';
  return null;
}

export function eraLetter(era: number): string | null {
  return ERA_LETTERS[era] ?? null;
}
