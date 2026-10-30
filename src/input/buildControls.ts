import type { SimulationClient } from '../bridge/simulationClient';
import { TILE_SIZE_PX } from '../core/config';
import { footprint, rotateClockwise, type BuildingSite, type Rotation } from '../core/world/buildings';
import type { BuildGhost } from '../render/buildGhost';
import type { Camera, Point } from '../render/camera';
import type { BuildTool, BuildToolbar } from '../ui/buildToolbar';

/**
 * Modo construção: a ferramenta da barra segue o cursor como prévia fantasma e o clique vira
 * comando para a simulação. A checagem aqui é só uma previsão; quem decide é o Worker.
 */
export class BuildControls {
  private tool: BuildTool = null;
  private rotation: Rotation = 0;
  private hover: Point | null = null;

  constructor(
    private readonly client: SimulationClient,
    private readonly site: BuildingSite,
    private readonly camera: Camera,
    private readonly ghost: BuildGhost,
    private readonly toolbar: BuildToolbar,
    canvas: HTMLElement,
  ) {
    canvas.addEventListener('pointermove', (event) => {
      const rect = canvas.getBoundingClientRect();
      const world = camera.screenToWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top });
      this.hover = { x: Math.floor(world.x / TILE_SIZE_PX), y: Math.floor(world.y / TILE_SIZE_PX) };
      this.refresh();
    });
    canvas.addEventListener('pointerleave', () => {
      this.hover = null;
      this.refresh();
    });
    window.addEventListener('keydown', this.onKeyDown);
  }

  select(tool: BuildTool): void {
    this.tool = tool;
    this.toolbar.setTool(tool);
    this.refresh();
  }

  /** Trata o clique no mapa. Devolve true se ele foi usado pelo modo construção. */
  click(screen: Point): boolean {
    if (!this.tool) return false;
    const tile = this.tileAt(screen);
    if (this.tool === 'remove') {
      this.client.send({ type: 'removeBuilding', x: tile.x, y: tile.y });
    } else {
      const corner = this.cornerFor(tile);
      this.client.send({ type: 'placeBuilding', kind: this.tool, ...corner, rotation: this.rotation });
    }
    return true;
  }

  /** Redesenha a prévia (também depois que a simulação publica construções novas). */
  refresh(): void {
    if (!this.tool || !this.hover) {
      this.ghost.hide();
      return;
    }
    if (this.tool === 'remove') {
      this.ghost.showRemoval(this.site.buildingAt(this.hover.x, this.hover.y));
      return;
    }
    const corner = this.cornerFor(this.hover);
    const problem = this.site.check(this.tool, corner.x, corner.y, this.rotation);
    this.ghost.showPlacement(this.tool, corner.x, corner.y, this.rotation, problem === null);
    this.toolbar.setProblem(problem);
  }

  /** O cursor fica no meio da construção, não no canto. */
  private cornerFor(tile: Point): Point {
    if (!this.tool || this.tool === 'remove') return tile;
    const { width, height } = footprint(this.tool, this.rotation);
    return { x: tile.x - Math.floor((width - 1) / 2), y: tile.y - Math.floor((height - 1) / 2) };
  }

  private tileAt(screen: Point): Point {
    const world = this.camera.screenToWorld(screen);
    return { x: Math.floor(world.x / TILE_SIZE_PX), y: Math.floor(world.y / TILE_SIZE_PX) };
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) return;
    if (event.code === 'Escape') this.select(null);
    else if (event.code === 'KeyX') this.select(this.tool === 'remove' ? null : 'remove');
    else if (event.code === 'KeyR') this.rotate();
  };

  /** R gira a prévia; sem ferramenta, gira a construção sob o cursor. */
  private rotate(): void {
    if (this.tool && this.tool !== 'remove') {
      this.rotation = rotateClockwise(this.rotation);
      this.refresh();
    } else if (!this.tool && this.hover) {
      this.client.send({ type: 'rotateBuilding', x: this.hover.x, y: this.hover.y });
    }
  }
}
