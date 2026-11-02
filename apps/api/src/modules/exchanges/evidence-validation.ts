import { Worker } from 'node:worker_threads';
import { processImage } from '../media/image-processor.js';
import { digest } from '../media/media-storage.js';
import { DomainError } from '../commands/domain-error.js';
export const evidenceLimit = (mime: string) =>
  mime.startsWith('image/')
    ? 10000000
    : mime === 'application/pdf'
      ? 20000000
      : 100000000;
const bad = () =>
  new DomainError(
    422,
    'VALIDATION_ERROR',
    'Tệp không hợp lệ, có nội dung chủ động hoặc không khớp loại đã khai báo. Chọn ảnh, PDF tĩnh hoặc MP4 khác.',
  );
const workerCode = `const {parentPort,workerData}=require('node:worker_threads');
(async()=>{const bytes=new Uint8Array(workerData.bytes);
 if(workerData.mime==='application/pdf'){
  const {getDocument}=await import(workerData.pdf);
  const task=getDocument({data:bytes,isEvalSupported:false,useSystemFonts:false,disableFontFace:true,verbosity:0});
  try {const pdf=await task.promise;
   if(pdf.numPages<1||pdf.numPages>500||await pdf.getJSActions()||await pdf.getAttachments()||pdf.isPureXfa||await pdf.getOpenAction())throw Error('active');
   const fields=await pdf.getFieldObjects(); if(fields&&Object.values(fields).flat().some(f=>f.actions))throw Error('actions');
   for(let n=1;n<=pdf.numPages;n++){const page=await pdf.getPage(n);if(await page.getJSActions())throw Error('actions');const ann=await page.getAnnotations();if(ann.some(a=>a.actions||a.attachment||a.url||a.unsafeUrl))throw Error('active annotation');await page.getOperatorList();page.cleanup();}
  }finally{await task.destroy();}
 }else{
  const {createFile,MP4BoxBuffer}=await import(workerData.mp4);
  const file=createFile(false);let info,failed=false;file.onError=()=>failed=true;file.onReady=i=>info=i;
  let offset=0,mdat=false,moov=false;const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  while(offset<bytes.length){if(offset+8>bytes.length)throw Error('box');let size=view.getUint32(offset),header=8;const type=String.fromCharCode(...bytes.slice(offset+4,offset+8));
   if(size===1){if(offset+16>bytes.length)throw Error('large box');const large=view.getBigUint64(offset+8);if(large>BigInt(bytes.length))throw Error('size');size=Number(large);header=16;}
   if(size===0)size=bytes.length-offset;if(size<header||offset+size>bytes.length)throw Error('size');if(type==='mdat'&&size>header)mdat=true;if(type==='moov')moov=true;offset+=size;
  }
  file.appendBuffer(MP4BoxBuffer.fromArrayBuffer(bytes.buffer,0));file.flush();
  if(failed||!mdat||!moov||!info||!info.videoTracks?.length||info.tracks.length>4||!info.duration||info.duration/info.timescale>7200||info.isFragmented)throw Error('video');
  if(info.tracks.some(t=>!t.nb_samples||!((['video','audio'].includes(t.type)&&/^(avc1|hvc1|hev1|av01|vp09|mp4a)/.test(t.codec))||(t.type==='metadata'&&t.codec==='mett'))))throw Error('track');
 }
 parentPort.postMessage(true);
})().catch(()=>parentPort.postMessage(false));`;
export async function validateEvidence(
  bytes: Buffer,
  m: { mimeType: string; byteSize: number; sha256: string },
) {
  if (
    bytes.length !== m.byteSize ||
    bytes.length > evidenceLimit(m.mimeType) ||
    digest(bytes) !== m.sha256
  )
    throw bad();
  if (m.mimeType.startsWith('image/')) {
    try {
      await processImage(bytes, m);
      return;
    } catch {
      throw bad();
    }
  }
  if (
    m.mimeType === 'application/pdf' &&
    !bytes.subarray(0, 8).toString('ascii').startsWith('%PDF-')
  )
    throw bad();
  if (
    m.mimeType === 'video/mp4' &&
    (bytes.length < 24 || bytes.subarray(4, 8).toString('ascii') !== 'ftyp')
  )
    throw bad();
  const copy = Uint8Array.from(bytes);
  await new Promise<void>((resolve, reject) => {
    const worker = new Worker(workerCode, {
      eval: true,
      workerData: {
        bytes: copy.buffer,
        mime: m.mimeType,
        pdf: import.meta.resolve('pdfjs-dist/legacy/build/pdf.mjs'),
        mp4: import.meta.resolve('mp4box'),
      },
      transferList: [copy.buffer],
      resourceLimits: {
        maxOldGenerationSizeMb: 256,
        maxYoungGenerationSizeMb: 32,
      },
    });
    let done = false;
    const timer = setTimeout(() => finish(false), 20000);
    function finish(ok: boolean) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      void worker.terminate();
      if (ok) resolve();
      else reject(bad());
    }
    worker.once('message', (v) => finish(v === true));
    worker.once('error', () => finish(false));
    worker.once('exit', () => finish(false));
  });
}
