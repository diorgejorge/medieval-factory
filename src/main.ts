import { Application, Container } from 'pixi.js';
import { SimulationClient } from './bridge/simulationClient';
import { MAP_SIZE_TILES, TILE_SIZE_PX } from './core/config';
import { UI_TEXT } from './core/data/data';
import { fillText } from './core/data/interfaceText';
import type { SimulationSnapshot } from './core/simulation';
import { START_STORAGE_ID } from './core/economy/economy';
import { buildingDef, buildingObject } from './core/world/buildings';
import { findNearestGrass } from './core/world/generator';
import { isClickOnArea, villageAt } from './core/world/villages';
import { createWorld } from './core/world/world';
import villageTexts from '../data/texto/pt-BR/vilarejos.json';
import { BuildControls } from './input/buildControls';
import { bindClicks } from './input/clickControls';
import { CameraControls } from './input/cameraControls';
import { bindSimulationControls } from './input/simulationControls';
import { BuildGhost } from './render/buildGhost';
import { Camera } from './render/camera';
import { GridRenderer } from './render/gridRenderer';
import { ObjectLayer } from './render/objectLayer';
import { ServantLayer } from './render/servantLayer';
import { loadObjectsAtlas, loadTerrainAtlas } from './render/terrainAtlas';
import { BuildingPanel, formatItems } from './ui/buildingPanel';
import { BuildToolbar } from './ui/buildToolbar';
import { eraName, showEraNotice } from './ui/eraNotice';
import { VillagePanel } from './ui/villagePanel';

const HUD_REFRESH_MS = 250;
const INITIAL_ZOOM = 2;
const SEED_PARAM = 'seed';

async function start(): Promise<void> {
  const host = document.getElementById('game');
  const hud = document.getElementById('hud');
  const panel = document.getElementById('panel');
  const toolbarElement = document.getElementById('toolbar');
  if (!host || !hud || !panel || !toolbarElement) throw new Error('Elementos #game/#hud/#panel/#toolbar ausentes no index.html');

  const app = new Application();
  await app.init({ resizeTo: host, background: 0x1b1a17, antialias: false, roundPixels: true });
  host.appendChild(app.canvas);

  const seed = readSeed();
  const { grid, settlements, site } = createWorld(seed, MAP_SIZE_TILES, villageTexts.names);
  const { start: village, villages, objects: mapObjects } = settlements;
  const [terrainAtlas, objectsAtlas] = await Promise.all([loadTerrainAtlas(), loadObjectsAtlas()]);
  const gridRenderer = new GridRenderer(grid, terrainAtlas);
  const world = new Container();
  world.addChild(gridRenderer.view);

  const objects = objectsAtlas ? new ObjectLayer(objectsAtlas) : null;
  if (objects) {
    objects.add(mapObjects);
    world.addChild(objects.view);
  }
  const servantLayer = new ServantLayer();
  world.addChild(servantLayer.view);
  const ghost = new BuildGhost(objects);
  world.addChild(ghost.view);
  app.stage.addChild(world);

  const camera = new Camera();
  camera.zoom = INITIAL_ZOOM;
  const mapCenterTile = Math.floor(MAP_SIZE_TILES / 2);
  const start = village?.center ?? findNearestGrass(grid, mapCenterTile, mapCenterTile) ?? { x: mapCenterTile, y: mapCenterTile };
  camera.centerOn(
    { x: (start.x + 0.5) * TILE_SIZE_PX, y: (start.y + 0.5) * TILE_SIZE_PX },
    app.screen.width,
    app.screen.height,
  );
  const controls = new CameraControls(camera, app.canvas);

  const simulation = new SimulationClient(seed);
  bindSimulationControls(simulation);
  bindNewMapKey();

  const toolbar = new BuildToolbar(toolbarElement, (tool) => build.select(tool));
  const build = new BuildControls(simulation, site, camera, ghost, toolbar, app.canvas);
  // Construções do jogador na camada de desenho, com "working" para a Visual animar só quem produz.
  let workingKey = '';
  const drawBuildings = () => {
    const reports = simulation.snapshot?.economy?.buildings ?? {};
    objects?.replaceGroup(
      'buildings',
      site.all.map((b) => ({ ...buildingObject(b), working: reports[b.id]?.status === 'working' })),
    );
  };
  simulation.onBuildingsChanged = (buildings) => {
    site.replaceAll(buildings);
    drawBuildings();
    build.refresh();
  };

  const villagePanel = new VillagePanel(panel, villageTexts.temperaments, {
    trade: (village, give, receive) => simulation.send({ type: 'trade', village, give, receive }),
    recruit: (village) => simulation.send({ type: 'recruit', village }),
  });
  const buildingPanel = new BuildingPanel(panel, (buildingId, recipe) =>
    simulation.send({ type: 'setRecipe', buildingId, recipe }),
  );
  bindClicks(app.canvas, (screen) => {
    if (build.click(screen)) return;
    const point = camera.screenToWorld(screen);
    const tile = { x: Math.floor(point.x / TILE_SIZE_PX), y: Math.floor(point.y / TILE_SIZE_PX) };
    const economy = simulation.snapshot?.economy;
    const building = site.buildingAt(tile.x, tile.y);
    const neighbor = villageAt(villages, tile.x, tile.y);
    buildingPanel.hide();
    villagePanel.hide();
    if (building) buildingPanel.show(building.id, buildingDef(building.kind).name, economy);
    else if (village && isClickOnArea(village.area, tile.x, tile.y)) buildingPanel.show(START_STORAGE_ID, UI_TEXT.hud.ownVillage, economy);
    else if (neighbor) villagePanel.show(neighbor, villages.indexOf(neighbor), economy);
  });

  let era = 1;
  toolbar.setEra(era);
  let sinceHudRefresh = 0;
  app.ticker.add((ticker) => {
    controls.update(ticker.deltaMS / 1000);
    world.scale.set(camera.zoom);
    // Posição em pixels inteiros de tela: evita "tremedeira" e costuras entre chunks na pixel art.
    world.position.set(Math.round(-camera.x * camera.zoom), Math.round(-camera.y * camera.zoom));
    gridRenderer.update(ticker.deltaMS);
    gridRenderer.cull(camera, app.screen.width, app.screen.height);
    objects?.cull(camera, app.screen.width, app.screen.height);
    servantLayer.update(simulation.snapshot?.economy?.servants ?? []);

    sinceHudRefresh += ticker.deltaMS;
    if (sinceHudRefresh >= HUD_REFRESH_MS) {
      sinceHudRefresh = 0;
      hud.textContent = formatHud(ticker.FPS, camera.zoom, seed, simulation.snapshot);
      buildingPanel.refresh(simulation.snapshot?.economy);
      villagePanel.refresh(simulation.snapshot?.economy);
      const reports = simulation.snapshot?.economy?.buildings ?? {};
      const nextWorkingKey = site.all.filter((b) => reports[b.id]?.status === 'working').map((b) => b.id).join();
      if (nextWorkingKey !== workingKey) {
        workingKey = nextWorkingKey;
        drawBuildings();
      }
      const snapshotEra = simulation.snapshot?.era ?? era;
      if (snapshotEra !== era) {
        era = snapshotEra;
        site.era = era;
        toolbar.setEra(era);
        buildingPanel.hide();
        villagePanel.hide();
        showEraNotice(panel, era);
      }
    }
  });
}

function formatHud(fps: number, zoom: number, seed: number, snapshot: SimulationSnapshot | null): string {
  const text = UI_TEXT.hud;
  // Sem snapshot ainda não há era: a linha termina antes dela.
  const era = snapshot ? eraName(snapshot.era) : '';
  const render = fillText(text.debugLine, { fps: Math.round(fps), zoom, seed, era }).trimEnd();
  if (!snapshot) return `${render}\n${text.starting}\n${text.help}`;
  // Pausado, o Worker não publica snapshots e o último UPS ficaria congelado na tela.
  const ups = snapshot.paused ? 0 : Math.round(snapshot.ups);
  const state = snapshot.paused ? text.paused : fillText(text.speed, { velocidade: snapshot.speed });
  const economy = snapshot.economy;
  const busy = economy?.servants.filter((servant) => servant.busy).length ?? 0;
  const stock = economy
    ? `\n${fillText(text.stock, { itens: formatItems(economy.stock) })}\n${fillText(text.servants, { ocupados: busy, total: economy.servants.length })}`
    : '';
  return `${render}\n${fillText(text.simLine, { ups, tick: snapshot.tick, estado: state })}\n${text.help}${stock}`;
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
