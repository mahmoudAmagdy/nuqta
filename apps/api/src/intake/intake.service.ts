import {
  Inject,
  Injectable,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import sharp from 'sharp';
import { appConfig } from '../config/app.config.js';
import type { AppConfig } from '../config/app.config.js';
import type { PageImage } from '../ocr/ocr.types.js';

const ACCEPTED_FORMATS = new Set(['png', 'jpeg', 'webp', 'tiff']);

/**
 * Stage 1. Turns an upload into the working image set: one PNG per page, in a
 * known orientation, with known pixel dimensions. Everything is rejected here,
 * before a provider is touched, if it is too large or not an image we accept.
 *
 * The type check reads the file's own header. The client's declared MIME type
 * and filename are not trusted.
 */
@Injectable()
export class IntakeService {
  constructor(@Inject(appConfig.KEY) private readonly config: AppConfig) {}

  async toPages(file: Buffer): Promise<PageImage[]> {
    if (file.byteLength > this.config.maxUploadBytes) {
      throw new PayloadTooLargeException(
        `File exceeds the ${this.config.maxUploadBytes} byte limit`,
      );
    }

    let format: string | undefined;
    try {
      ({ format } = await sharp(file).metadata());
    } catch {
      format = undefined;
    }
    if (!format || !ACCEPTED_FORMATS.has(format)) {
      throw new UnsupportedMediaTypeException(
        'Unsupported file type. Accepted: PNG, JPEG, WebP, TIFF',
      );
    }

    // rotate() with no argument applies the EXIF orientation, so a phone photo
    // reaches the provider the way up it was taken.
    const { data, info } = await sharp(file)
      .rotate()
      .png()
      .toBuffer({ resolveWithObject: true });

    return [
      {
        index: 0,
        data,
        mimeType: 'image/png',
        width: info.width,
        height: info.height,
      },
    ];
  }
}
