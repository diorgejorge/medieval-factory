import { Application, Container } from 'pixi.js';
import { MAP_SIZE_TILES, TILE_SIZE_PX } from './core/config';
import { Grid } from './core/world/grid';
import { Terrain } from './core/world/terrain';
import { CameraControls } from './input/cameraControls';
import { Camera } from './render/camera';
import { GridRenderer } from './render/gridRenderer';

const HUD_REFRESH_MS = 250;

async function start(): Promise<void> {
  const host = document.getElementById('game');
  const hud = document.getElementById('hud');
  if (!host || !hud) throw new Error('Elementos #game/#hud ausentes no index.html');

  const app = new Application();
  await app.init({ resizeTo: host, background: 0x1b1a17, antialias: false });
  host.appendChild(app.canvas);

  const gridRenderer = new GridRenderer(createDemoGrid());
  const world = new Container();
  world.addChild(gridRenderer.view);
  app.stage.addChild(world);

  const camera = new Camera();
  const mapCenter = (MAP_SIZE_TILES * TILE_SIZE_PX) / 2;
  camera.centerOn({ x: mapCenter, y: mapCenter }, app.screen.width, app.screen.height);
  const controls = new CameraControls(camera, app.canvas);

  let sinceHudRefresh = 0;
  app.ticker.add((ticker) => {
    controls.update(ticker.deltaMS / 1000);
    world.scale.set(camera.zoom);
    world.position.set(-camera.x * camera.zoom, -camera.y * camera.zoom);
    gridRenderer.cull(camera, app.screen.width, app.screen.height);

    sinceHudRefresh += ticker.deltaMS;
    if (sinceHudRefresh >= HUD_REFRESH_MS) {
      sinceHudRefresh = 0;
      hud.textContent = `FPS ${Math.round(ticker.FPS)}  zoom ${camera.zoom.toFixed(2)}x`;
    }
  });
}

/** Terreno de demonstração até a geração por seed (M1): só para ver a grade e o culling. */
function createDemoGrid(): Grid {
  const grid = new Grid(MAP_SIZE_TILES);
  const riverX = MAP_SIZE_TILES / 2;
  for (let i = 0; i < grid.size; i++) {
    grid.setTerrain(riverX, i, Terrain.Water);
    grid.setTerrain(riverX + 1, i, Terrain.Water);
    grid.setTerrain(i, i, Terrain.Dirt);
  }
  return grid;
}

void start();
