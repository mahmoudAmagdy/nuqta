import {
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import sharp from 'sharp';
import type { AppConfig } from '../config/app.config.js';
import { IntakeService } from './intake.service.js';

const config: AppConfig = {
  port: 3000,
  corsOrigins: [],
  maxUploadBytes: 50_000,
};

function blank(width: number, height: number) {
  return sharp({
    create: { width, height, channels: 3, background: 'white' },
  });
}

describe('IntakeService', () => {
  const intake = new IntakeService(config);

  it('normalises an accepted image to one PNG page with its dimensions', async () => {
    const jpeg = await blank(120, 80).jpeg().toBuffer();

    const pages = await intake.toPages(jpeg);

    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({
      index: 0,
      mimeType: 'image/png',
      width: 120,
      height: 80,
    });
    expect((await sharp(pages[0]?.data).metadata()).format).toBe('png');
  });

  it('applies EXIF orientation so the provider sees the page upright', async () => {
    // Orientation 6: the stored pixels are 120x80, the picture is 80x120.
    const rotated = await blank(120, 80)
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const [page] = await intake.toPages(rotated);

    expect(page).toMatchObject({ width: 80, height: 120 });
  });

  it('rejects an oversized file before decoding it', async () => {
    await expect(
      intake.toPages(Buffer.alloc(config.maxUploadBytes + 1)),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
  });

  it('rejects content that is not an image, whatever it claims to be', async () => {
    await expect(
      intake.toPages(Buffer.from('<html>not an image</html>')),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
  });

  it('rejects a real image in a format outside the allow-list', async () => {
    const gif = await blank(10, 10).gif().toBuffer();

    await expect(intake.toPages(gif)).rejects.toBeInstanceOf(
      UnsupportedMediaTypeException,
    );
  });
});
