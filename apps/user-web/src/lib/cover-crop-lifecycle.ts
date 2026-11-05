import { cropImageToCover, type CoverPosition } from './image-crop';

/** Accept only the latest crop, releasing results that have lost their caller. */
export function createCoverCropLifecycle(crop = cropImageToCover) {
  let active = true;
  let generation = 0;
  let pending: number | null = null;
  return {
    activate() { active = true; },
    invalidate() { generation += 1; pending = null; },
    dispose() { active = false; generation += 1; pending = null; },
    isPending() { return active && pending !== null; },
    async run(file: File, position: CoverPosition, existingRawUrl?: string) {
      const current = ++generation;
      pending = current;
      try {
        const result = await crop(file, position, existingRawUrl);
        if (active && current === generation) return result;
        URL.revokeObjectURL(result.croppedUrl);
        // Repositioning borrows the current cover's raw URL; it still has an owner.
        if (existingRawUrl === undefined) URL.revokeObjectURL(result.rawUrl);
        return null;
      } catch (error) {
        // The crop helper owns failure cleanup. An obsolete failure must not
        // replace the error state or move focus after a newer action/navigation.
        if (!active || current !== generation) return null;
        throw error;
      } finally {
        if (pending === current) pending = null;
      }
    },
  };
}
