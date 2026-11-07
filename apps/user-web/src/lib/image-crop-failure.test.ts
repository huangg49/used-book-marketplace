import { afterEach, describe, expect, it, vi } from 'vitest';
import { cropImageToCover } from './image-crop';

type Failure = 'decode' | 'context' | 'blob' | 'encode' | undefined;
function fixture(failure?: Failure) {
  const create = vi.spyOn(URL, 'createObjectURL').mockImplementationOnce(() => 'blob:qa-raw').mockImplementation(() => 'blob:qa-cropped');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.stubGlobal('Image', class {
    src = '';
    naturalWidth = 80;
    naturalHeight = 120;
    async decode() { if (failure === 'decode') throw new Error('Synthetic decode failure'); }
  });
  vi.stubGlobal('document', { createElement: () => ({
    width: 0, height: 0,
    getContext: () => failure === 'context' ? null : { drawImage: vi.fn() },
    toBlob: (complete: (blob: Blob | null) => void) => {
      if (failure === 'encode') throw new Error('Synthetic encode failure');
      complete(failure === 'blob' ? null : new Blob(['qa'], { type: 'image/png' }));
    },
  }) });
  return { create, revoke, file: new File(['qa'], 'qa-cover.png', { type: 'image/png' }) };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('cover crop URL ownership', () => {
  it.each(['decode', 'context', 'blob', 'encode'] as const)('releases a newly owned raw preview after %s failure', async failure => {
    const f = fixture(failure);
    await expect(cropImageToCover(f.file)).rejects.toThrow();
    expect(f.create).toHaveBeenCalledTimes(1);
    expect(f.revoke).toHaveBeenCalledExactlyOnceWith('blob:qa-raw');
  });

  it.each(['decode', 'context', 'blob', 'encode'] as const)('retains the caller raw preview after %s failure', async failure => {
    const f = fixture(failure);
    await expect(cropImageToCover(f.file, 50, 'blob:qa-existing')).rejects.toThrow();
    expect(f.create).not.toHaveBeenCalled();
    expect(f.revoke).not.toHaveBeenCalled();
  });

  it('transfers both successful previews to the caller without revoking them', async () => {
    const f = fixture();
    const result = await cropImageToCover(f.file);
    expect(result.rawUrl).toBe('blob:qa-raw');
    expect(result.croppedUrl).toBe('blob:qa-cropped');
    expect(result.croppedFile.type).toBe('image/png');
    expect(f.create).toHaveBeenCalledTimes(2);
    expect(f.revoke).not.toHaveBeenCalled();
  });

  it('reuses a caller preview when repositioning instead of allocating another raw URL', async () => {
    const f = fixture();
    const result = await cropImageToCover(f.file, 25, 'blob:qa-existing');
    expect(result.rawUrl).toBe('blob:qa-existing');
    expect(f.create).toHaveBeenCalledTimes(1);
    expect(f.revoke).not.toHaveBeenCalled();
  });
});
