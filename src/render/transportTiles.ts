import type { MapObject } from '../core/world/mapObjects';

/** Lado de saída de cada rotação do contrato (horária a partir do sul). */
const SIDES = ['s', 'w', 'n', 'e'] as const;
type Side = (typeof SIDES)[number];

const STEP: Readonly<Record<Side, readonly [number, number]>> = { s: [0, 1], w: [-1, 0], n: [0, -1], e: [1, 0] };
const OPPOSITE: Readonly<Record<Side, Side>> = { s: 'n', n: 's', e: 'w', w: 'e' };
/** Peças que levam itens para a vizinha; só calha e esteira trocam de arte conforme as vizinhas. */
const CONVEYOR = /^(chute|belt|hoist|splitter|filter)_r([0-3])$/;
const CONNECTABLE = new Set(['chute', 'belt']);

interface Piece {
  material: string;
  out: Side;
}

/** Ordem dos lados de entrada no nome do frame, igual à de assets/_tools/conveyor.py. */
const INPUT_ORDER: readonly Side[] = ['n', 'e', 's', 'w'];

/**
 * Encaixe automático de calhas e esteiras (peças 1×1): a arte de cada peça mostra por onde a carga entra.
 * O frame é `<m>_from_<entradas>_to_<saída>` (entradas na ordem n, e, s, w; `none` = começo da linha),
 * então reta, curva, T e cruz emendam com as vizinhas. Sem a arte no atlas, mantém o frame original.
 */
export function connectTransport(objects: readonly MapObject[], hasFrame: (name: string) => boolean): MapObject[] {
  const pieces = new Map<string, Piece>();
  for (const object of objects) {
    const piece = parsePiece(object);
    if (piece) pieces.set(tileKey(object), piece);
  }
  if (pieces.size === 0) return [...objects];

  return objects.map((object) => {
    const piece = parsePiece(object);
    if (!piece || !CONNECTABLE.has(piece.material)) return object;
    const [tx, ty] = tileOf(object);
    const feeds = (side: Side) => {
      const [dx, dy] = STEP[side];
      return pieces.get(`${tx + dx},${ty + dy}`)?.out === OPPOSITE[side];
    };
    const inputs = INPUT_ORDER.filter((side) => side !== piece.out && feeds(side)).join('');
    const frame = `${piece.material}_from_${inputs || 'none'}_to_${piece.out}`;
    return hasFrame(frame) ? { ...object, frame } : object;
  });
}

const ROAD = 'road';
/** Ordem dos lados no nome do frame da estrada (`road_<lados>`), igual à de assets/_tools/roads.py. */
const ROAD_SIDES: readonly Side[] = ['n', 'e', 's', 'w'];

/** Variantes da arte de cada encaixe (assets/_tools/road_art.py), sorteadas pela posição. */
const ROAD_VARIANTS = 4;

function roadVariant(x: number, y: number): number {
  return (((x * 7 + y * 3) % ROAD_VARIANTS) + ROAD_VARIANTS) % ROAD_VARIANTS;
}

/** Estrada emenda com as vizinhas: o frame lista os lados que têm estrada (`road_ns_2`, `road_nesw_0`...). */
export function connectRoads(objects: readonly MapObject[], hasFrame: (name: string) => boolean): MapObject[] {
  const roads = new Set(objects.filter((object) => object.frame === ROAD).map(tileKey));
  if (roads.size === 0) return [...objects];
  return objects.map((object) => {
    if (object.frame !== ROAD) return object;
    const [tx, ty] = tileOf(object);
    const sides = ROAD_SIDES.filter((side) => roads.has(`${tx + STEP[side][0]},${ty + STEP[side][1]}`)).join('');
    const base = sides ? `${ROAD}_${sides}` : ROAD;
    const variant = `${base}_${roadVariant(tx, ty)}`;
    const frame = hasFrame(variant) ? variant : base;
    return hasFrame(frame) ? { ...object, frame } : object;
  });
}

function parsePiece(object: MapObject): Piece | null {
  const match = CONVEYOR.exec(object.frame);
  const [, material, rotation] = match ?? [];
  const out = SIDES[Number(rotation)];
  return material && out ? { material, out } : null;
}

/** Peça 1×1: o objeto fica no centro da base (x + 0,5; y + 1) do tile. */
function tileOf(object: MapObject): [number, number] {
  return [Math.round(object.x - 0.5), Math.round(object.y - 1)];
}

function tileKey(object: MapObject): string {
  const [x, y] = tileOf(object);
  return `${x},${y}`;
}
