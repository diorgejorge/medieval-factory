import { Terrain, type TerrainType } from './terrain';

/**
 * Grade quadrada de tiles guardada em Uint8Arrays (row-major):
 * cache-friendly e transferível entre threads sem cópia.
 */
export class Grid {
  readonly size: number;
  private readonly terrain: Uint8Array;
  /** Altitude 0–255 de cada tile. As calhas (M3) só descem nesse relevo. */
  private readonly height: Uint8Array;

  constructor(size: number, fill: TerrainType = Terrain.Grass) {
    if (!Number.isInteger(size) || size <= 0) {
      throw new RangeError(`Tamanho de grade inválido: ${size}`);
    }
    this.size = size;
    this.terrain = new Uint8Array(size * size).fill(fill);
    this.height = new Uint8Array(size * size);
  }

  isInside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.size && y < this.size;
  }

  getTerrain(x: number, y: number): TerrainType {
    return this.terrain[this.indexOf(x, y)] as TerrainType;
  }

  setTerrain(x: number, y: number, type: TerrainType): void {
    this.terrain[this.indexOf(x, y)] = type;
  }

  getHeight(x: number, y: number): number {
    return this.height[this.indexOf(x, y)] ?? 0;
  }

  setHeight(x: number, y: number, value: number): void {
    this.height[this.indexOf(x, y)] = value;
  }

  private indexOf(x: number, y: number): number {
    if (!this.isInside(x, y)) {
      throw new RangeError(`Tile fora da grade: (${x}, ${y})`);
    }
    return y * this.size + x;
  }
}
