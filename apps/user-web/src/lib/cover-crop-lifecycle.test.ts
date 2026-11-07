import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCoverCropLifecycle } from './cover-crop-lifecycle';
import type { CoverCropResult, cropImageToCover } from './image-crop';

const file = new File(['QA'], 'qa-cover.png', { type: 'image/png' });
function result(name: string): CoverCropResult {
  return { rawFile: file, croppedFile: file, rawUrl: `blob:${name}-raw`, croppedUrl: `blob:${name}-crop`,
    naturalWidth: 160, naturalHeight: 90, aspectRatio: 16 / 9, offsetPercent: 50, align: 'center',
    cropRectPercent: { left: 0, top: 0, width: 50, height: 100 } };
}
function deferred() {
  let resolve!: (value: CoverCropResult) => void, reject!: (reason: Error) => void;
  const promise = new Promise<CoverCropResult>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture() {
  const crop = vi.fn<typeof cropImageToCover>();
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  return { crop, revoke, lifecycle: createCoverCropLifecycle(crop) };
}
afterEach(() => vi.restoreAllMocks());

describe('cover crop lifecycle', () => {
  it.each(['resolve', 'reject'] as const)('a stale %s cannot release the current pending guard', async outcome => {
    const f = fixture(), old = deferred(), latest = deferred();
    f.crop.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    expect(f.lifecycle.isPending()).toBe(false);
    const first = f.lifecycle.run(file, 25), second = f.lifecycle.run(file, 75);
    expect(f.lifecycle.isPending()).toBe(true);
    if (outcome === 'resolve') old.resolve(result('old')); else old.reject(new Error('Synthetic obsolete failure'));
    await expect(first).resolves.toBeNull(); expect(f.lifecycle.isPending()).toBe(true);
    latest.resolve(result('latest')); await second; expect(f.lifecycle.isPending()).toBe(false);
  });
  it.each(['invalidate', 'dispose'] as const)('%s releases the guard without waiting for canceled work', async action => {
    const f = fixture(), pending = deferred(); f.crop.mockReturnValueOnce(pending.promise);
    const task = f.lifecycle.run(file, 50); expect(f.lifecycle.isPending()).toBe(true);
    f.lifecycle[action](); expect(f.lifecycle.isPending()).toBe(false);
    pending.resolve(result('old')); await task; expect(f.lifecycle.isPending()).toBe(false);
  });
  it('releases the guard after a current failure', async () => {
    const f = fixture(), pending = deferred(); f.crop.mockReturnValueOnce(pending.promise);
    const task = f.lifecycle.run(file, 50); expect(f.lifecycle.isPending()).toBe(true);
    pending.reject(new Error('Synthetic current failure')); await expect(task).rejects.toThrow();
    expect(f.lifecycle.isPending()).toBe(false);
  });
  it('drops a first response delivered after the newer selection and releases its two owned URLs', async () => {
    const f = fixture(), old = deferred(), latest = deferred();
    f.crop.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    const first = f.lifecycle.run(file, 'left'), second = f.lifecycle.run(file, 'right');
    const accepted = result('latest'); latest.resolve(accepted);
    await expect(second).resolves.toBe(accepted);
    old.resolve(result('old')); await expect(first).resolves.toBeNull();
    expect(f.revoke.mock.calls).toEqual([['blob:old-crop'], ['blob:old-raw']]);
  });
  it('does not revoke the borrowed raw URL of an obsolete reposition', async () => {
    const f = fixture(), pending = deferred(); f.crop.mockReturnValueOnce(pending.promise);
    const task = f.lifecycle.run(file, 25, 'blob:shared-raw'); f.lifecycle.invalidate();
    pending.resolve({ ...result('old'), rawUrl: 'blob:shared-raw' }); await expect(task).resolves.toBeNull();
    expect(f.revoke.mock.calls).toEqual([['blob:old-crop']]);
  });
  it.each(['invalidate', 'dispose'] as const)('%s prevents a deleted/unmounted cover from returning', async action => {
    const f = fixture(), pending = deferred(); f.crop.mockReturnValueOnce(pending.promise);
    const task = f.lifecycle.run(file, 50); f.lifecycle[action](); pending.resolve(result('old'));
    await expect(task).resolves.toBeNull(); expect(f.revoke).toHaveBeenCalledTimes(2);
  });
  it('keeps old work obsolete across a StrictMode dispose/activate cycle', async () => {
    const f = fixture(), pending = deferred(); f.crop.mockReturnValueOnce(pending.promise);
    const task = f.lifecycle.run(file, 50); f.lifecycle.dispose(); f.lifecycle.activate();
    pending.resolve(result('old')); await expect(task).resolves.toBeNull();
    const accepted = result('new'); f.crop.mockResolvedValueOnce(accepted);
    await expect(f.lifecycle.run(file, 50)).resolves.toBe(accepted);
    expect(f.revoke.mock.calls).toEqual([['blob:old-crop'], ['blob:old-raw']]);
  });
  it('surfaces a current failure without claiming cleanup ownership from the crop helper', async () => {
    const f = fixture(), error = new Error('Synthetic current failure'); f.crop.mockRejectedValueOnce(error);
    await expect(f.lifecycle.run(file, 50)).rejects.toBe(error); expect(f.revoke).not.toHaveBeenCalled();
  });
  it.each(['invalidate', 'dispose'] as const)('ignores a late error after %s', async action => {
    const f = fixture(), pending = deferred(); f.crop.mockReturnValueOnce(pending.promise);
    const task = f.lifecycle.run(file, 50); f.lifecycle[action](); pending.reject(new Error('Synthetic late failure'));
    await expect(task).resolves.toBeNull(); expect(f.revoke).not.toHaveBeenCalled();
  });
});
