import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { run } from '@fmtk/async-main';
import PromisePool from '@supercharge/promise-pool';
import { createHash } from 'crypto';
import fg from 'fast-glob';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { lookup as mime } from 'mime-types';
import path from 'path';
import pretty from 'pretty-bytes';
import { pipeline as _pipeline } from 'stream';
import { promisify } from 'util';
import { MultiCommandLineStatus } from './util/MultiCommandLineStatus';
import { progressBar } from './util/progressBar';

const pipeline = promisify(_pipeline);

const MAX_CONCURRENCY = 5;

async function main(args: string[]): Promise<number> {
  if (args.length !== 2) {
    console.error(`usage: s3assets <source> s3://<dest>[/prefix]`);
    return 2;
  }

  const [source, dest] = args;

  const destUrl = new URL(dest);
  if (destUrl.protocol !== 's3:') {
    console.error(`expected second argument to be a s3:// url`);
    return 2;
  }

  const sourceBase = path.dirname(path.resolve(source));

  const bucket = destUrl.host;
  const objectPrefix = destUrl.pathname;

  const s3 = new S3Client({});
  const status = new MultiCommandLineStatus();

  status.status = 'Searching for files...';
  const files = await fg(source);

  await PromisePool.withConcurrency(MAX_CONCURRENCY)
    .for(files)
    .handleError((err) => {
      // abort processing immediately
      throw err;
    })
    .process(async (fileName) => {
      const filePath = path.resolve(fileName);
      const fileStat = await stat(fileName);
      const itemStatus = status.addRow();
      itemStatus.status = `${fileName}: computing hash`;

      const hash = createHash('sha1');
      let reader = createReadStream(fileName);
      await pipeline(reader, hash);
      const hashValue = hash.digest('hex');

      itemStatus.status = `${fileName}: uploading`;
      reader = createReadStream(filePath);

      const ext = path.extname(filePath);

      const destPath = path.join(
        objectPrefix,
        path.relative(sourceBase, path.dirname(filePath)),
        path.basename(filePath, ext) + `.${hashValue}${ext}`,
      );

      const upload = new Upload({
        client: s3,
        params: {
          Body: reader,
          Bucket: bucket,
          Key: destPath,
          CacheControl: 'public, max-age=31536000',
          ContentType: mime(fileName) || 'application/octet-stream',
        },
      });

      upload.on('httpUploadProgress', (progress) => {
        itemStatus.status =
          progressBar((progress.loaded ?? 0) / fileStat.size, 20) +
          ` ${fileName} (${pretty(fileStat.size)})`;
      });

      await upload.done();
      itemStatus.interrupt(
        `uploaded ${fileName} -> ${destPath} (${pretty(fileStat.size)})`,
      );
      itemStatus.close();
    });

  return 0;
}

run(main);
