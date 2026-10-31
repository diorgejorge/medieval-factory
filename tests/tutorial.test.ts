import { describe, expect, it } from 'vitest';
import tutorialText from '../data/texto/pt-BR/tutorial.json';
import { STEP_DONE, type TutorialState } from '../src/ui/tutorial';

const IDLE: TutorialState = {
  kinds: new Set(),
  removed: 0,
  cameraMoved: false,
  villageOpened: false,
  timeChanged: false,
  decreeProgress: false,
};

describe('tutorial', () => {
  it('toda regra é de um passo que existe no texto do Roteiro', () => {
    const ids = new Set(tutorialText.steps.map((s) => s.id));
    for (const id of Object.keys(STEP_DONE)) expect(ids, id).toContain(id);
  });

  it('só a carta inicial e a final terminam com um clique', () => {
    const manual = tutorialText.steps.map((s) => s.id).filter((id) => !STEP_DONE[id]);
    expect(manual).toEqual(['carta-inicial', 'fim-do-tutorial']);
  });

  it('nenhum passo termina sem o jogador fazer nada', () => {
    for (const [id, done] of Object.entries(STEP_DONE)) expect(done(IDLE), id).toBe(false);
  });

  it('o passo do armazém termina com um armazém construído', () => {
    expect(STEP_DONE['armazem']?.({ ...IDLE, kinds: new Set(['storage']) })).toBe(true);
  });
});
