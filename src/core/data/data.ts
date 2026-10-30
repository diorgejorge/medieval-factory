import buildings from '../../../data/jogo/construcoes.json';
import items from '../../../data/jogo/itens.json';
import recipes from '../../../data/jogo/receitas.json';
import { parseGameData } from './gameData';

/**
 * Dados do jogo conferidos ao carregar: se algum JSON estiver errado, o jogo para com a
 * lista de problemas em vez de rodar com dados quebrados.
 */
export const GAME_DATA = parseGameData({ items, buildings, recipes });
