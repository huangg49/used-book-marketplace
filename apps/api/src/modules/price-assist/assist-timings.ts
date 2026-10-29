// Safe timings contain only fixed stage names and durations, never prompts,
// image data, identifiers, credentials or user content. No persistence change.
export type AssistStage =
  'prepare' | 'images' | 'model' | 'catalog' | 'complete';
export class AssistTimings {
  private readonly started: number;
  private readonly stages = new Map<AssistStage, number>();
  constructor(private readonly now: () => number = () => performance.now()) {
    this.started = now();
  }
  async measure<T>(stage: AssistStage, work: () => Promise<T>): Promise<T> {
    const start = this.now();
    try {
      return await work();
    } finally {
      this.stages.set(
        stage,
        (this.stages.get(stage) ?? 0) + Math.max(0, this.now() - start),
      );
    }
  }
  header() {
    return [...this.stages]
      .map(([stage, ms]) => `ai_${stage};dur=${ms.toFixed(1)}`)
      .concat(
        `ai_total;dur=${Math.max(0, this.now() - this.started).toFixed(1)}`,
      )
      .join(', ');
  }
}
