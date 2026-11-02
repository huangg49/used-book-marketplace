import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateEvidence } from './evidence-validation.js';
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
function pdf(extra = '') {
  const body = [
    '<< /Type /Catalog /Pages 2 0 R ' + extra + ' >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << >> >>',
  ];
  let text = '%PDF-1.4\n',
    offsets = [0];
  for (let i = 0; i < body.length; i++) {
    offsets.push(Buffer.byteLength(text));
    text += `${i + 1} 0 obj\n${body[i]}\nendobj\n`;
  }
  const start = Buffer.byteLength(text);
  text +=
    'xref\n0 4\n0000000000 65535 f \n' +
    offsets
      .slice(1)
      .map((n) => String(n).padStart(10, '0') + ' 00000 n \n')
      .join('') +
    `trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(text);
}
it('parses a real static PDF and rejects document JavaScript', async () => {
  const bytes = pdf();
  await expect(
    validateEvidence(bytes, {
      mimeType: 'application/pdf',
      byteSize: bytes.length,
      sha256: sha(bytes),
    }),
  ).resolves.toBeUndefined();
  const active = pdf('/OpenAction << /S /JavaScript /JS (app.alert) >>');
  await expect(
    validateEvidence(active, {
      mimeType: 'application/pdf',
      byteSize: active.length,
      sha256: sha(active),
    }),
  ).rejects.toThrow();
}, 25000);
it('parses an actual MP4 and rejects truncated data and a disguised executable', async () => {
  const bytes = readFileSync(
    new URL('../../../../../docs/ui/motion-01/before-100.mp4', import.meta.url),
  );
  await expect(
    validateEvidence(bytes, {
      mimeType: 'video/mp4',
      byteSize: bytes.length,
      sha256: sha(bytes),
    }),
  ).resolves.toBeUndefined();
  for (const bad of [bytes.subarray(0, 30), Buffer.from('MZnotvideo')])
    await expect(
      validateEvidence(bad, {
        mimeType: 'video/mp4',
        byteSize: bad.length,
        sha256: sha(bad),
      }),
    ).rejects.toThrow();
}, 25000);
