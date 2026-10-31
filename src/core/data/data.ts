import buildings from '../../../data/jogo/construcoes.json';
import items from '../../../data/jogo/itens.json';
import eras from '../../../data/jogo/eras.json';
import start from '../../../data/jogo/inicio.json';
import recipes from '../../../data/jogo/receitas.json';
import challenges from '../../../data/jogo/desafios.json';
import buildingNames from '../../../data/texto/pt-BR/construcoes.json';
import descriptions from '../../../data/texto/pt-BR/descricoes.json';
import interfaceText from '../../../data/texto/pt-BR/interface.json';
import itemNames from '../../../data/texto/pt-BR/itens.json';
import { parseGameData } from './gameData';
import { parseCategoryNames, parseInterfaceText } from './interfaceText';

/**
 * Dados do jogo conferidos ao carregar: se algum JSON estiver errado, o jogo para com a
 * lista de problemas em vez de rodar com dados quebrados. Os nomes vêm dos textos do Roteiro.
 */
export const GAME_DATA = parseGameData({ items, buildings, recipes, itemNames, buildingNames, start, eras, challenges });

/** Textos fixos da interface (data/texto/pt-BR/interface.json), conferidos do mesmo jeito. */
export const UI_TEXT = parseInterfaceText(interfaceText);

/** Nomes das categorias da barra de construção (toolbar.categories, com nome provisório se faltar). */
export const CATEGORY_NAMES = parseCategoryNames(interfaceText);

/** Descrição curta (dica) de cada item e construção, por id (data/texto/pt-BR/descricoes.json). */
export const DESCRIPTIONS: { items: Readonly<Record<string, string>>; buildings: Readonly<Record<string, string>> } = descriptions;
