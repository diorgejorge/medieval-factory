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

/**
 * Encaixe automático de calhas e esteiras (peças 1×1): a arte de cada peça depende de quem despeja nela.
 * Com alguém atrás, segue reta; só de lado, vira curva (`<m>_turn_<entra><sai>`); sem ninguém, ganha a
 * tampa do começo (`<m>_start_<sai>`). Sem a arte no atlas, mantém o frame original.
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
    if (feeds(OPPOSITE[piece.out])) return object;
    const from = SIDES.find((side) => side !== piece.out && feeds(side));
    const frame = from ? `${piece.material}_turn_${from}${piece.out}` : `${piece.material}_start_${piece.out}`;
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
