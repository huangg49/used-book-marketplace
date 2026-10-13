export const W: number, H: number, DURATION: number, SETTLED: number
export const SIDE_WIDTH: number
export type Layer = { id: string; file: string; x: number; y: number; width: number; height: number; z: number; pivot: number[]; clip?: string; attachment?: { parent: string }; motionAnchor?: { uv: number[] } }
export function frameOpacity(time: number): number
export function phase(time: number): string
export function spritePose(time: number, layer: Layer): { x: number; y: number; angle: number }
