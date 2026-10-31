import { Application, Container } from 'pixi.js';
import { SimulationClient } from './bridge/simulationClient';
import { MAP_SIZE_TILES, TILE_SIZE_PX } from './core/config';
import { DESCRIPTIONS, UI_TEXT } from './core/data/data';
import { fillText } from './core/data/interfaceText';
import type { SimulationSnapshot } from './core/simulation';
import { START_STORAGE_ID } from './core/economy/economy';
import { buildingDef, buildingObject, footprint } from './core/world/buildings';
import { findNearestGrass } from './core/world/generator';
import { isClickOnArea, villageAt } from './core/world/villages';
import { createWorld } from './core/world/world';
import villageTexts from '../data/texto/pt-BR/vilarejos.json';
import { BuildControls } from './input/buildControls';
import { readSave, writeSave } from './bridge/saveStore';
import { bindClicks } from './input/clickControls';
import { CameraControls } from './input/cameraControls';
import { PlayerControls } from './input/playerControls';
import { GatherControls, type DropPoint } from './input/gatherControls';
import { Player } from './core/player';
import { bindSimulationControls } from './input/simulationControls';
import { BuildGhost } from './render/buildGhost';
import { CartLayer } from './render/cartLayer';
import { Camera } from './render/camera';
import { GridRenderer } from './render/gridRenderer';
import { ObjectLayer } from './render/objectLayer';
import { scatterBoulders } from './render/scenery';
import { ServantLayer } from './render/servantLayer';
import { loadObjectsAtlas, loadTerrainAtlas } from './render/terrainAtlas';
import { BuildingPanel, formatItems } from './ui/buildingPanel';
import { RoutePicker, type RouteEndpointOption } from './ui/routePicker';
import { BuildToolbar } from './ui/buildToolbar';
import { decreeLines, showDecreeNotice } from './ui/decreeNotice';
import { eraName, showEraNotice } from './ui/eraNotice';
import { Tutorial } from './ui/tutorial';
import { VillagePanel } from './ui/villagePanel';

const HUD_REFRESH_MS = 250;
const INITIAL_ZOOM = 2;
const SEED_PARAM = 'seed';
const LOAD_PARAM = 'load';
/** Por quanto tempo o aviso de jogo salvo fica no HUD. */
const SAVE_MESSAGE_MS = 3000;
let saveMessage: { text: string; until: number } | null = null;

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
    objects.add(scatterBoulders(grid));
    world.addChild(objects.view);
  }
  const carts = objectsAtlas ? new CartLayer(objectsAtlas) : null;
  if (carts) world.addChild(carts.view);
  const servantLayer = new ServantLayer(objectsAtlas);
  world.addChild(servantLayer.view);
  // O camponês do jogador usa o mesmo desenho dos servos.
  const playerLayer = new ServantLayer(objectsAtlas);
  world.addChild(playerLayer.view);
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
  controls.keyboardPan = false;
  const player = new Player(start.x + 0.5, start.y + 0.5, grid, (x, y) => {
    // Estrada não bloqueia: é por onde se anda.
    const building = site.buildingAt(x, y);
    return building !== null && !buildingDef(building.kind).road;
  });
  const playerControls = new PlayerControls(player);
  const cameraStart = { x: camera.x, y: camera.y, zoom: camera.zoom };

  // ?load=1: carrega o jogo salvo (a página já veio com a seed dele).
  const loading = new URLSearchParams(location.search).get(LOAD_PARAM) === '1';
  const saved = loading ? await readSave() : null;
  const simulation = new SimulationClient(seed, saved ?? undefined);
  bindSaveKeys(simulation, (text) => (saveMessage = { text, until: performance.now() + SAVE_MESSAGE_MS }));
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
      site.all.map((b) => {
        const working = reports[b.id]?.status === 'working';
        return { ...buildingObject(b, working), working };
      }),
    );
  };
  // Tutorial da Era I: observa o jogo e avança sozinho (ver ui/tutorial.ts).
  const tutorialElement = document.createElement('div');
  tutorialElement.id = 'tutorial';
  tutorialElement.hidden = true;
  document.body.appendChild(tutorialElement);
  const tutorial = new Tutorial(tutorialElement);
  let removedBuildings = 0;
  let villageOpened = false;
  simulation.onBuildingsChanged = (buildings) => {
    if (buildings.length < site.all.length) removedBuildings++;
    site.replaceAll(buildings);
    drawBuildings();
    build.refresh();
  };

  const gatherControls = new GatherControls(player, grid, simulation);
  // Onde o camponês larga a carga: a vila e os armazéns construídos.
  const dropPoints = (): DropPoint[] => [
    ...(village ? [{ storageId: START_STORAGE_ID, area: village.area }] : []),
    ...site.all
      .filter((b) => buildingDef(b.kind).storage)
      .map((b) => {
        const { width, height } = footprint(b.kind, b.rotation);
        return { storageId: b.id, area: { left: b.x, top: b.y, width, height } };
      }),
  ];

  const villagePanel = new VillagePanel(panel, villageTexts.temperaments, {
    trade: (village, give, receive) => simulation.send({ type: 'trade', village, give, receive }),
    recruit: (village) => simulation.send({ type: 'recruit', village }),
  });
  // Pontas de rota das carroças: a vila, os armazéns construídos e os vilarejos vizinhos.
  const routeOptions = (): RouteEndpointOption[] => [
    { endpoint: { storage: START_STORAGE_ID }, name: UI_TEXT.hud.ownVillage },
    ...site.all
      .filter((b) => buildingDef(b.kind).storage)
      .map((b) => ({ endpoint: { storage: b.id }, name: `${buildingDef(b.kind).name} ${b.id}` })),
    ...villages.map((v, index) => ({ endpoint: { village: index }, name: v.name, produces: v.produces, wants: v.wants })),
  ];
  const routePicker = new RoutePicker(routeOptions, (buildingId, route) =>
    simulation.send({ type: 'setCartRoute', buildingId, ...route }),
  );
  const buildingPanel = new BuildingPanel(
    panel,
    (buildingId, recipe) => simulation.send({ type: 'setRecipe', buildingId, recipe }),
    (buildingId, item) => simulation.send({ type: 'setFilter', buildingId, item }),
    routePicker,
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
    if (building) buildingPanel.show(building.id, buildingDef(building.kind).name, economy, DESCRIPTIONS.buildings[building.kind]);
    else if (village && isClickOnArea(village.area, tile.x, tile.y)) buildingPanel.show(START_STORAGE_ID, UI_TEXT.hud.ownVillage, economy);
    else if (neighbor) {
      villageOpened = true;
      villagePanel.show(neighbor, villages.indexOf(neighbor), economy);
    }
  });

  let era = 1;
  let decreeCycle = 0;
  let decreeFinished = 0;
  toolbar.setEra(era);
  let sinceHudRefresh = 0;
  app.ticker.add((ticker) => {
    controls.update(ticker.deltaMS / 1000);
    // Andando, a câmera volta a seguir o camponês (arrastar com o mouse ainda solta a câmera).
    if (playerControls.update(ticker.deltaMS / 1000)) {
      camera.centerOn({ x: player.x * TILE_SIZE_PX, y: player.y * TILE_SIZE_PX }, app.screen.width, app.screen.height);
    }
    const hand = simulation.snapshot?.economy?.hand;
    gatherControls.update(ticker.deltaMS / 1000, hand?.amount ?? 0, dropPoints());
    playerLayer.update([{ x: player.x, y: player.y, busy: false, carrying: hand?.item ?? null }]);
    world.scale.set(camera.zoom);
    // Posição em pixels inteiros de tela: evita "tremedeira" e costuras entre chunks na pixel art.
    world.position.set(Math.round(-camera.x * camera.zoom), Math.round(-camera.y * camera.zoom));
    gridRenderer.update(ticker.deltaMS);
    gridRenderer.cull(camera, app.screen.width, app.screen.height);
    objects?.cull(camera, app.screen.width, app.screen.height);
    servantLayer.update(simulation.snapshot?.economy?.servants ?? []);
    carts?.update(simulation.snapshot?.economy?.carts ?? []);

    sinceHudRefresh += ticker.deltaMS;
    if (sinceHudRefresh >= HUD_REFRESH_MS) {
      sinceHudRefresh = 0;
      const notice = saveMessage && performance.now() < saveMessage.until ? `\n${saveMessage.text}` : '';
      hud.textContent = formatHud(ticker.FPS, camera.zoom, seed, simulation.snapshot) + notice;
      buildingPanel.refresh(simulation.snapshot?.economy);
      villagePanel.refresh(simulation.snapshot?.economy);
      const reports = simulation.snapshot?.economy?.buildings ?? {};
      const nextWorkingKey = site.all.filter((b) => reports[b.id]?.status === 'working').map((b) => b.id).join();
      if (nextWorkingKey !== workingKey) {
        workingKey = nextWorkingKey;
        drawBuildings();
      }
      const snapshot = simulation.snapshot;
      tutorial.update({
        kinds: new Set(site.all.map((b) => b.kind)),
        removed: removedBuildings,
        cameraMoved: camera.x !== cameraStart.x || camera.y !== cameraStart.y || camera.zoom !== cameraStart.zoom,
        villageOpened,
        timeChanged: snapshot !== null && (snapshot.paused || snapshot.speed !== 1),
        decreeProgress: (snapshot?.decree?.delivered ?? 0) > 0 || (snapshot?.decree?.finished ?? 0) > 0,
      });
      const snapshotEra = simulation.snapshot?.era ?? era;
      if (snapshotEra !== era) {
        era = snapshotEra;
        site.era = era;
        toolbar.setEra(era);
        buildingPanel.hide();
        villagePanel.hide();
        showEraNotice(panel, era);
      }
      // Decreto novo (ou o fim do anterior): a carta do rei no painel.
      const decree = simulation.snapshot?.decree;
      if (decree && (decree.cycle !== decreeCycle || decree.finished !== decreeFinished)) {
        // Resultado novo (cumprido ou prazo esgotado) junto com o decreto seguinte, se ele já chegou.
        const withResult = decree.finished !== decreeFinished;
        decreeFinished = decree.finished;
        decreeCycle = decree.cycle;
        buildingPanel.hide();
        villagePanel.hide();
        showDecreeNotice(panel, decree, withResult);
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
  const decree = snapshot.decree ? `\n${decreeLines(snapshot.decree)}` : '';
  const hand = economy?.hand.item
    ? `\n${fillText(text.hand, { itens: formatItems({ [economy.hand.item]: economy.hand.amount }) })}`
    : '';
  return `${render}\n${fillText(text.simLine, { ups, tick: snapshot.tick, estado: state })}\n${text.help}${stock}${hand}${decree}`;
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
    url.searchParams.delete(LOAD_PARAM);
    location.assign(url);
  });
}

/** K salva o jogo; L recarrega a página com a seed do jogo salvo e o carrega. */
function bindSaveKeys(simulation: SimulationClient, notify: (text: string) => void): void {
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyK') {
      void simulation
        .requestSave()
        .then(writeSave)
        .then(() => notify(UI_TEXT.hud.saved))
        .catch(() => notify(UI_TEXT.hud.saveFailed));
    } else if (event.code === 'KeyL') {
      void readSave().then((data) => {
        if (!data) return notify(UI_TEXT.hud.noSave);
        const url = new URL(location.href);
        url.searchParams.set(SEED_PARAM, String(data.seed));
        url.searchParams.set(LOAD_PARAM, '1');
        location.assign(url);
      });
    }
  });
}

void start();
