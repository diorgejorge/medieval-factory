import { describe, expect, it } from 'vitest';
import interfaceText from '../data/texto/pt-BR/interface.json';
import { UI_TEXT } from '../src/core/data/data';
import { GameDataError } from '../src/core/data/gameData';
import { INTERFACE_KEYS, fillText, parseCategoryNames, parseInterfaceText, quoteText } from '../src/core/data/interfaceText';

function problemsOf(raw: unknown): string[] {
  try {
    parseInterfaceText(raw);
    return [];
  } catch (error) {
    if (error instanceof GameDataError) return [...error.problems];
    throw error;
  }
}

describe('textos da interface (data/texto/pt-BR/interface.json)', () => {
  it('toda chave que o código usa existe, é um texto e tem os placeholders preenchidos pelo código', () => {
    expect(problemsOf(structuredClone(interfaceText))).toEqual([]);
    for (const [section, keys] of Object.entries(INTERFACE_KEYS)) {
      const texts = (interfaceText as unknown as Record<string, Record<string, unknown>>)[section];
      for (const key of Object.keys(keys)) {
        expect(typeof texts?.[key], `${section}.${key}`).toBe('string');
        expect((UI_TEXT as unknown as Record<string, Record<string, string>>)[section]?.[key]).toBe(texts?.[key]);
      }
    }
  });

  it('aponta chave faltando, seção faltando e placeholder sumido, tudo de uma vez', () => {
    const raw = structuredClone(interfaceText) as unknown as Record<string, Record<string, unknown>>;
    delete raw['toolbar']?.['remove'];
    delete raw['eraNotice'];
    if (raw['hud']) raw['hud']['stock'] = 'Estoque';
    const problems = problemsOf(raw);
    expect(problems).toHaveLength(3);
    expect(problems.join('\n')).toContain('"toolbar.remove"');
    expect(problems.join('\n')).toContain('"eraNotice"');
    expect(problems.join('\n')).toContain('{itens}');
  });

  it('fillText troca os placeholders e deixa os desconhecidos', () => {
    expect(fillText('Dar {quantidade} {dar} → receber {quantidade} {receber}', { quantidade: 5, dar: 'Trigo', receber: 'Pão' })).toBe(
      'Dar 5 Trigo → receber 5 Pão',
    );
    expect(fillText('Hoje ninguém de {vilarejo} vai: {comida}', { comida: 3 })).toBe('Hoje ninguém de {vilarejo} vai: 3');
    // O valor não é lido de novo: um {texto} dentro da fala não é trocado.
    expect(quoteText(UI_TEXT, 'Oi {texto}')).toBe(fillText(UI_TEXT.common.quote, { texto: 'Oi {texto}' }));
    expect(quoteText(UI_TEXT, 'Oi {texto}')).toContain('Oi {texto}');
  });
});

describe('nomes das categorias da barra (toolbar.categories)', () => {
  it('usa o texto do Roteiro quando existe e o provisório quando falta', () => {
    const names = parseCategoryNames({ version: 1, toolbar: { categories: { housing: 'Casas' } } });
    expect(names.housing).toBe('Casas');
    expect(names.logistics.length).toBeGreaterThan(0);
    expect(parseCategoryNames({}).extraction.length).toBeGreaterThan(0);
  });
});
