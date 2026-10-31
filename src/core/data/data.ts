import buildings from '../../../data/jogo/construcoes.json';
import items from '../../../data/jogo/itens.json';
import eras from '../../../data/jogo/eras.json';
import start from '../../../data/jogo/inicio.json';
import recipes from '../../../data/jogo/receitas.json';
import buildingNames from '../../../data/texto/pt-BR/construcoes.json';
import itemNames from '../../../data/texto/pt-BR/itens.json';
import { parseGameData } from './gameData';

/**
 * Dados do jogo conferidos ao carregar: se algum JSON estiver errado, o jogo para com a
 * lista de problemas em vez de rodar com dados quebrados. Os nomes vêm dos textos do Roteiro.
 */
export const GAME_DATA = parseGameData({ items, buildings, recipes, itemNames, buildingNames, start, eras });
