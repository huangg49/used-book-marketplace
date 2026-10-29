import { Injectable } from '@nestjs/common';
import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';
import sharp from 'sharp';
import { isbn13 } from '../commands/contract-input.service.js';

// CPU decoding runs off the HTTP event loop, with fixed row/pass/pixel/time bounds.
const decoder = `
const {parentPort,workerData}=require('node:worker_threads');
const base=require('node:path').dirname(workerData.modulePath);
const EAN13Reader=require(base+'/core/oned/EAN13Reader.js').default;
const RGBLuminanceSource=require(base+'/core/RGBLuminanceSource.js').default;
const BinaryBitmap=require(base+'/core/BinaryBitmap.js').default;
const GlobalHistogramBinarizer=require(base+'/core/common/GlobalHistogramBinarizer.js').default;
const found=new Set();
for(const frame of workerData.frames){
  const bitmap=new BinaryBitmap(new GlobalHistogramBinarizer(new RGBLuminanceSource(new Uint8ClampedArray(frame.data),frame.width,frame.height)));
  const reader=new EAN13Reader();
  for(let n=1;n<33;n++){
    const y=Math.floor(n*frame.height/33);
    for(let direction=0;direction<2;direction++){
      let row;
      try{row=bitmap.getBlackRow(y);if(direction)row.reverse();}catch{continue;}
      for(let pass=0;pass<4;pass++){
        try{
          const result=reader.decodeRow(y,row), text=result.getText();
          if(/^97[89][0-9]{10}$/.test(text))found.add(text);
          const points=result.getResultPoints().map(p=>p.getX());
          const start=Math.max(0,Math.floor(Math.min(...points))-8), end=Math.min(frame.width,Math.ceil(Math.max(...points))+8);
          if(end<=start)break;
          for(let x=start;x<end;x++)if(row.get(x))row.flip(x);
        }catch{break;}
      }
    }
  }
}
parentPort.postMessage([...found].sort().slice(0,6));`;

@Injectable()
export class IsbnBarcodeReader {
  private running = 0;
  async read(bytes: Buffer): Promise<string[]> {
    if (this.running >= 2) throw new Error('Local barcode reader busy');
    this.running++;
    try {
      const frames: { data: Uint8Array; width: number; height: number }[] = [];
      for (const angle of [0, 90]) {
        const { data, info } = await sharp(bytes, {
          limitInputPixels: 16_000_000,
        })
          .rotate(angle)
          .resize({
            width: 1600,
            height: 1600,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .flatten({ background: 'white' })
          .greyscale()
          .raw()
          .timeout({ seconds: 2 })
          .toBuffer({ resolveWithObject: true });
        frames.push({
          data: new Uint8Array(data),
          width: info.width,
          height: info.height,
        });
      }
      return await new Promise<string[]>((resolve, reject) => {
        let settled = false;
        const worker = new Worker(decoder, {
          eval: true,
          execArgv: [],
          workerData: {
            modulePath: createRequire(import.meta.url).resolve(
              '@zxing/library',
            ),
            frames,
          },
          resourceLimits: { maxOldGenerationSizeMb: 64 },
        });
        const timer = setTimeout(() => {
          void worker.terminate();
          reject(new Error('Local barcode deadline'));
        }, 1500);
        worker.once('message', (value: unknown) => {
          settled = true;
          clearTimeout(timer);
          void worker.terminate();
          if (!Array.isArray(value)) {
            reject(new Error('Invalid local barcode result'));
            return;
          }
          resolve(
            [
              ...new Set(
                value.flatMap((v) =>
                  typeof v === 'string' && isbn13(v) ? [v] : [],
                ),
              ),
            ].slice(0, 6),
          );
        });
        worker.once('error', (error) => {
          clearTimeout(timer);
          reject(error);
        });
        worker.once('exit', () => {
          clearTimeout(timer);
          if (!settled) reject(new Error('Local barcode worker stopped'));
        });
      });
    } finally {
      this.running--;
    }
  }
}
