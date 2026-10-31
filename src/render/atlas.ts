/** Formato de spritesheet do Pixi exportado pela equipe Visual (assets/<nome>/<nome>.json). */
interface AtlasJson {
  frames: Record<string, { frame: AtlasFrame; anchor?: { x: number; y: number }; density?: number }>;
  animations?: Record<string, string[]>;
}

export interface AtlasFrame {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Pixels da arte por pixel do chão (construções em alta definição = 2); ausente = 1. */
  density?: number;
}

export interface Atlas {
  image: HTMLImageElement;
  frames: ReadonlyMap<string, AtlasFrame>;
  animations: ReadonlyMap<string, readonly AtlasFrame[]>;
}

/** Carrega um atlas; devolve null se ele não existir, e quem chamou cai num visual provisório. */
export async function loadAtlas(jsonUrl: string, imageUrl: string): Promise<Atlas | null> {
  try {
    const response = await fetch(jsonUrl);
    if (!response.ok) return null;
    const json = (await response.json()) as AtlasJson;
    const image = new Image();
    image.src = imageUrl;
    await image.decode();

    const frames = new Map(
      Object.entries(json.frames).map(([name, entry]): [string, AtlasFrame] => [
        name,
        entry.density ? { ...entry.frame, density: entry.density } : entry.frame,
      ]),
    );
    const animations = new Map(
      Object.entries(json.animations ?? {}).map(([name, frameNames]) => [
        name,
        frameNames.map((frameName) => frames.get(frameName)).filter((f): f is AtlasFrame => f !== undefined),
      ]),
    );
    return { image, frames, animations };
  } catch {
    return null;
  }
}
