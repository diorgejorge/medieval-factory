import { Application, Container } from 'pixi.js';
import { SimulationClient } from './bridge/simulationClient';
import { MAP_SIZE_TILES, TILE_SIZE_PX } from './core/config';
import type { SimulationSnapshot } from './core/simulation';
import { findNearestGrass, generateWorld } from './core/world/generator';
import { CameraControls } from './input/cameraControls';
import { bindSimulationControls } from './input/simulationControls';
import { Camera } from './render/camera';
import { GridRenderer } from './render/gridRenderer';
import { loadTerrainAtlas } from './render/terrainAtlas';

const HUD_REFRESH_MS = 250;
const INITIAL_ZOOM = 2;
const SEED_PARAM = 'seed';

async function start(): Promise<void> {
  const host = document.getElementById('game');
  const hud = document.getElementById('hud');
  if (!host || !hud) throw new Error('Elementos #game/#hud ausentes no index.html');

  const app = new Application();
  await app.init({ resizeTo: host, background: 0x1b1a17, antialias: false, roundPixels: true });
  host.appendChild(app.canvas);

  const seed = readSeed();
  const grid = generateWorld(seed, MAP_SIZE_TILES);
  const gridRenderer = new GridRenderer(grid, await loadTerrainAtlas());
  const world = new Container();
  world.addChild(gridRenderer.view);
  app.stage.addChild(world);

  const camera = new Camera();
  camera.zoom = INITIAL_ZOOM;
  const mapCenterTile = Math.floor(MAP_SIZE_TILES / 2);
  const start = findNearestGrass(grid, mapCenterTile, mapCenterTile) ?? { x: mapCenterTile, y: mapCenterTile };
  camera.centerOn(
    { x: (start.x + 0.5) * TILE_SIZE_PX, y: (start.y + 0.5) * TILE_SIZE_PX },
    app.screen.width,
    app.screen.height,
  );
  const controls = new CameraControls(camera, app.canvas);

  const simulation = new SimulationClient();
  bindSimulationControls(simulation);
  bindNewMapKey();

  let sinceHudRefresh = 0;
  app.ticker.add((ticker) => {
    controls.update(ticker.deltaMS / 1000);
    world.scale.set(camera.zoom);
    // Posição em pixels inteiros de tela: evita "tremedeira" e costuras entre chunks na pixel art.
    world.position.set(Math.round(-camera.x * camera.zoom), Math.round(-camera.y * camera.zoom));
    gridRenderer.update(ticker.deltaMS);
    gridRenderer.cull(camera, app.screen.width, app.screen.height);

    sinceHudRefresh += ticker.deltaMS;
    if (sinceHudRefresh >= HUD_REFRESH_MS) {
      sinceHudRefresh = 0;
      hud.textContent = formatHud(ticker.FPS, camera.zoom, seed, simulation.snapshot);
    }
  });
}

function formatHud(fps: number, zoom: number, seed: number, snapshot: SimulationSnapshot | null): string {
  const render = `FPS ${Math.round(fps)}  zoom ${zoom}x  seed ${seed}`;
  const help = '[espaço] pausa  [1-3] velocidade  [N] novo mapa';
  if (!snapshot) return `${render}\nsimulação iniciando...\n${help}`;
  // Pausado, o Worker não publica snapshots e o último UPS ficaria congelado na tela.
  const ups = snapshot.paused ? 0 : Math.round(snapshot.ups);
  const state = snapshot.paused ? 'PAUSADO' : `${snapshot.speed}x`;
  return `${render}\nUPS ${ups}  tick ${snapshot.tick}  ${state}\n${help}`;
}

/** A seed vem da URL (?seed=123) para um mapa poder ser compartilhado; sem ela, sorteia uma. */
function readSeed(): number {
  const fromUrl = Number(new URLSearchParams(location.search).get(SEED_PARAM));
  return Number.isInteger(fromUrl) && fromUrl > 0 ? fromUrl : randomSeed();
}

function randomSeed(): number {
  return 1 + Math.floor(Math.random() * 999_999);
}

function bindNewMapKey(): void {
  window.addEventListener('keydown', (event) => {
    if (event.code !== 'KeyN' || event.repeat) return;
    const url = new URL(location.href);
    url.searchParams.set(SEED_PARAM, String(randomSeed()));
    location.assign(url);
  });
}

void start();
