import type { PageImage } from '../../ocr.types.js';
import { mapTesseractPage } from './tesseract.mapper.js';
import type { TessPage } from './tesseract.mapper.js';

const image: PageImage = {
  index: 0,
  data: Buffer.alloc(0),
  mimeType: 'image/png',
  width: 1000,
  height: 400,
};

const word = (text: string, confidence: number, x0: number, x1: number) => ({
  text,
  confidence,
  bbox: { x0, y0: 10, x1, y1: 50 },
});

describe('mapTesseractPage', () => {
  it('flattens blocks and paragraphs into lines of tokens', () => {
    const data: TessPage = {
      blocks: [
        {
          paragraphs: [
            {
              lines: [
                {
                  text: 'النقطة التي\n',
                  bbox: { x0: 700, y0: 10, x1: 950, y1: 50 },
                  words: [
                    word('النقطة', 96, 840, 950),
                    word('التي', 88, 700, 820),
                  ],
                },
              ],
            },
            {
              lines: [
                {
                  text: 'SKU-4471-B\n',
                  bbox: { x0: 100, y0: 80, x1: 300, y1: 120 },
                  words: [word('SKU-4471-B', 91, 100, 300)],
                },
              ],
            },
          ],
        },
      ],
    };

    const page = mapTesseractPage(data, image);

    expect(page.lines.map((line) => line.text)).toEqual([
      'النقطة التي',
      'SKU-4471-B',
    ]);
    expect(page.lines[0]?.tokens[1]).toEqual({
      text: 'التي',
      confidence: 0.88,
      box: { x: 700, y: 10, width: 120, height: 40 },
      polygon: [
        { x: 700, y: 10 },
        { x: 820, y: 10 },
        { x: 820, y: 50 },
        { x: 700, y: 50 },
      ],
    });
  });

  it('rescales confidence to 0..1 and scores a line by its tokens', () => {
    const page = mapTesseractPage(
      {
        blocks: [
          {
            paragraphs: [
              {
                lines: [
                  {
                    text: 'a b',
                    bbox: { x0: 0, y0: 0, x1: 10, y1: 10 },
                    words: [word('a', 100, 0, 4), word('b', 50, 6, 10)],
                  },
                ],
              },
            ],
          },
        ],
      },
      image,
    );

    expect(page.lines[0]?.confidence).toBeCloseTo(0.75);
  });

  it('drops whitespace-only words and the lines left empty by them', () => {
    const page = mapTesseractPage(
      {
        blocks: [
          {
            paragraphs: [
              {
                lines: [
                  {
                    text: ' ',
                    bbox: { x0: 0, y0: 0, x1: 10, y1: 10 },
                    words: [word(' ', 10, 0, 10)],
                  },
                ],
              },
            ],
          },
        ],
      },
      image,
    );

    expect(page.lines).toEqual([]);
  });

  it('tolerates a result with no blocks', () => {
    expect(mapTesseractPage({ blocks: null }, image).lines).toEqual([]);
  });

  it('reports detected rotation in degrees', () => {
    const page = mapTesseractPage(
      { blocks: [], rotateRadians: Math.PI / 2 },
      image,
    );

    expect(page.angle).toBeCloseTo(90);
  });
});
