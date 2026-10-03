import { readFileSync } from 'node:fs';
import type { PageImage } from '../../ocr.types.js';
import { mapAzureReadResult } from './azure-read.mapper.js';
import type { AzureOperation } from './azure-read.types.js';

const fixture = JSON.parse(
  readFileSync(
    new URL('./__fixtures__/read-arabic-invoice-lines.json', import.meta.url),
    'utf8',
  ),
) as AzureOperation;

const image: PageImage = {
  index: 3,
  data: Buffer.alloc(0),
  mimeType: 'image/png',
  width: 800,
  height: 200,
};

describe('mapAzureReadResult', () => {
  const page = mapAzureReadResult(fixture.analyzeResult ?? {}, image);

  it('keeps the page identity of the image that was sent, not Azure’s numbering', () => {
    expect(page).toMatchObject({
      index: 3,
      width: 800,
      height: 200,
      angle: 0.4,
    });
  });

  it('assigns each word to the line whose span contains it', () => {
    expect(page.lines.map((line) => line.tokens.map((t) => t.text))).toEqual([
      ['فاتورة', 'رقم', 'INV-2041'],
      ['الإجمالي', '١٢٥٠'],
    ]);
    expect(page.lines.map((line) => line.text)).toEqual([
      'فاتورة رقم INV-2041',
      'الإجمالي ١٢٥٠',
    ]);
  });

  it('carries geometry and confidence for every token', () => {
    const digits = page.lines[1]?.tokens[1];

    expect(digits).toEqual({
      text: '١٢٥٠',
      confidence: 0.71,
      box: { x: 500, y: 102, width: 80, height: 36 },
      polygon: [
        { x: 500, y: 102 },
        { x: 580, y: 102 },
        { x: 580, y: 138 },
        { x: 500, y: 138 },
      ],
    });
  });

  it('scores a line as the mean of its tokens', () => {
    expect(page.lines[1]?.confidence).toBeCloseTo((0.98 + 0.71) / 2);
  });

  it('rescales geometry when Azure reports a different unit than the image', () => {
    const inches = structuredClone(fixture.analyzeResult ?? {});
    const source = inches.pages?.[0];
    if (!source) throw new Error('fixture has no page');
    source.unit = 'inch';
    source.width = 8;
    source.height = 2;
    for (const item of [...(source.words ?? []), ...(source.lines ?? [])]) {
      item.polygon = item.polygon?.map((value) => value / 100);
    }

    const rescaled = mapAzureReadResult(inches, image);

    expect(rescaled.lines[0]?.tokens[0]?.box).toEqual(
      page.lines[0]?.tokens[0]?.box,
    );
  });

  it('drops a word that has no geometry, since it cannot be highlighted', () => {
    const partial = structuredClone(fixture.analyzeResult ?? {});
    delete partial.pages?.[0]?.words?.[1]?.polygon;

    const mapped = mapAzureReadResult(partial, image);

    expect(mapped.lines[0]?.tokens.map((t) => t.text)).toEqual([
      'فاتورة',
      'INV-2041',
    ]);
  });

  it('returns an empty page rather than failing on an empty result', () => {
    expect(mapAzureReadResult({}, image).lines).toEqual([]);
  });
});
