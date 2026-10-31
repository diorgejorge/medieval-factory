import { GAME_DATA } from '../data/data';
import { add, available, freeSpace, take, type Storage } from './storage';

/** Itens por troca: o jogador dá TRADE_AMOUNT do que o vilarejo pede e recebe o mesmo tanto do que ele produz. */
export const TRADE_AMOUNT = 5;
/** Comida (itens da categoria "food") paga por servo recrutado. */
export const RECRUIT_FOOD = 10;
/** Abaixo disso o vilarejo não cede mais gente. */
export const MIN_POPULATION = 5;

export type VillageResult = 'tradeAccepted' | 'tradeRefused' | 'recruited' | 'recruitRefused';

export interface VillageState {
  produces: readonly string[];
  wants: readonly string[];
  population: number;
  /** Resultado do último pedido do jogador, para o painel mostrar a fala certa. */
  result: VillageResult | null;
  /** Conta os pedidos do jogador: o painel só mostra o resultado de pedidos feitos com ele aberto. */
  requests: number;
}

export interface VillageView {
  population: number;
  result: VillageResult | null;
  requests: number;
}

/**
 * Troca: tira o item pedido dos armazéns do jogador e põe o produto no `home`.
 * Recusa se o vilarejo não pede/produz isso, se falta o item ou se não cabe.
 */
export function trade(village: VillageState, give: string, receive: string, storages: readonly Storage[], home: Storage): boolean {
  const ok =
    village.wants.includes(give) &&
    village.produces.includes(receive) &&
    available(storages, give) >= TRADE_AMOUNT &&
    freeSpace(home) + (home.items.get(give) ?? 0) >= TRADE_AMOUNT;
  if (ok) {
    take(storages, give, TRADE_AMOUNT);
    add(home, receive, TRADE_AMOUNT);
  }
  village.result = ok ? 'tradeAccepted' : 'tradeRefused';
  village.requests++;
  return ok;
}

/** Recrutar: paga RECRUIT_FOOD de comida (qualquer item "food", na ordem dos dados) e o vilarejo perde um morador. */
export function recruit(village: VillageState, storages: readonly Storage[]): boolean {
  const foods = [...GAME_DATA.items.values()].filter((item) => item.category === 'food').map((item) => item.id);
  const totalFood = foods.reduce((sum, item) => sum + available(storages, item), 0);
  const ok = village.population > MIN_POPULATION && totalFood >= RECRUIT_FOOD;
  if (ok) {
    let missing = RECRUIT_FOOD;
    for (const item of foods) {
      const amount = Math.min(missing, available(storages, item));
      take(storages, item, amount);
      missing -= amount;
    }
    village.population--;
  }
  village.result = ok ? 'recruited' : 'recruitRefused';
  village.requests++;
  return ok;
}
