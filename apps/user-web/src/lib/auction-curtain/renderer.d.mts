export class MeshRenderer {
  constructor(canvas: HTMLCanvasElement, images: HTMLImageElement[], kind: 'inner' | 'outer', forceCanvas?: boolean)
  mode: string
  resize(width: number, height: number, dpr: number): void
  draw(time: number): void
  dispose(): void
}
