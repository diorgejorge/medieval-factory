/**
 * Converte tempo real decorrido em um número inteiro de passos fixos.
 * Passos fixos deixam a simulação determinística, independentemente do FPS.
 */
export class FixedStepClock {
  private accumulatorMs = 0;

  constructor(
    private readonly stepMs: number,
    private readonly maxStepsPerAdvance: number,
  ) {}

  /** Retorna quantos passos devem rodar agora. */
  advance(elapsedMs: number): number {
    this.accumulatorMs += Math.max(0, elapsedMs);
    const steps = Math.floor(this.accumulatorMs / this.stepMs);
    if (steps > this.maxStepsPerAdvance) {
      // Atraso grande demais: descarta o excedente em vez de tentar recuperar (ver MAX_TICKS_PER_ADVANCE).
      this.accumulatorMs = 0;
      return this.maxStepsPerAdvance;
    }
    this.accumulatorMs -= steps * this.stepMs;
    return steps;
  }
}
