import { Container, Graphics, type Sprite } from 'pixi.js';
import { TILE_SIZE_PX } from '../core/config';
import { buildingObject, footprint, type Building, type BuildingKind, type Rotation } from '../core/world/buildings';
import type { ObjectLayer } from './objectLayer';

const OK_COLOR = 0x6fcf6f;
const BLOCKED_COLOR = 0xe0533d;
const NO_TINT = 0xffffff;
const BLOCKED_TINT = 0xff7a6a;
const AREA_ALPHA = 0.35;
const SPRITE_ALPHA = 0.6;
/** Seta de rotação: triângulo no meio da borda para onde a construção "olha". */
const ARROW_PX = 5;

/** Prévia fantasma: a construção semitransparente, o terreno que ela ocupa e a direção. */
export class BuildGhost {
  readonly view = new Container();
  private readonly area = new Graphics();
  private sprite: Sprite | null = null;
  private spriteKey = '';

  constructor(private readonly objects: ObjectLayer | null) {
    this.view.addChild(this.area);
    this.view.visible = false;
  }

  showPlacement(kind: BuildingKind, x: number, y: number, rotation: Rotation, ok: boolean): void {
    const { width, height } = footprint(kind, rotation);
    const color = ok ? OK_COLOR : BLOCKED_COLOR;
    this.drawArea(x, y, width, height, color);
    this.drawArrow(x, y, width, height, rotation, color);
    this.setSprite({ id: 0, kind, x, y, rotation });
    if (this.sprite) this.sprite.tint = ok ? NO_TINT : BLOCKED_TINT;
    this.view.visible = true;
  }

  /** No modo remover: destaca a construção sob o cursor, se houver. */
  showRemoval(building: Building | null): void {
    this.setSprite(null);
    if (!building) {
      this.view.visible = false;
      return;
    }
    const { width, height } = footprint(building.kind, building.rotation);
    this.drawArea(building.x, building.y, width, height, BLOCKED_COLOR);
    this.view.visible = true;
  }

  hide(): void {
    this.view.visible = false;
  }

  private drawArea(x: number, y: number, width: number, height: number, color: number): void {
    this.area
      .clear()
      .rect(x * TILE_SIZE_PX, y * TILE_SIZE_PX, width * TILE_SIZE_PX, height * TILE_SIZE_PX)
      .fill({ color, alpha: AREA_ALPHA })
      .stroke({ width: 1, color, alignment: 1 });
  }

  private drawArrow(x: number, y: number, width: number, height: number, rotation: Rotation, color: number): void {
    const left = x * TILE_SIZE_PX;
    const top = y * TILE_SIZE_PX;
    const right = left + width * TILE_SIZE_PX;
    const bottom = top + height * TILE_SIZE_PX;
    const midX = (left + right) / 2;
    const midY = (top + bottom) / 2;
    const a = ARROW_PX;
    const points = [
      [midX, top - a, midX - a, top, midX + a, top],
      [right + a, midY, right, midY - a, right, midY + a],
      [midX, bottom + a, midX - a, bottom, midX + a, bottom],
      [left - a, midY, left, midY - a, left, midY + a],
    ][rotation];
    if (points) this.area.poly(points).fill({ color });
  }

  private setSprite(building: Building | null): void {
    const key = building ? `${building.kind}:${building.x}:${building.y}:${building.rotation}` : '';
    if (key === this.spriteKey) return;
    this.spriteKey = key;
    this.sprite?.destroy();
    this.sprite = building && this.objects ? this.objects.spriteFor(buildingObject(building)) : null;
    if (!this.sprite) return;
    this.sprite.alpha = SPRITE_ALPHA;
    this.view.addChild(this.sprite);
  }
}
