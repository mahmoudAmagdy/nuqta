import { clamp01, mean, quadFromBox } from '../../geometry.js';
import type {
  BoundingBox,
  OcrLine,
  OcrPage,
  OcrToken,
  PageImage,
} from '../../ocr.types.js';

/**
 * The slice of tesseract.js output the mapper reads. Declared here rather than
 * imported so the provider's payload type stays inside this folder.
 */
interface TessBbox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
interface TessWord {
  text: string;
  confidence: number;
  bbox: TessBbox;
}
interface TessLine {
  text: string;
  bbox: TessBbox;
  words: TessWord[];
}
export interface TessPage {
  blocks: { paragraphs: { lines: TessLine[] }[] }[] | null;
  rotateRadians?: number | null;
}

/** Tesseract nests block > paragraph > line > word; only lines and words survive. */
export function mapTesseractPage(data: TessPage, image: PageImage): OcrPage {
  const lines: OcrLine[] = [];
  for (const block of data.blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        const mapped = mapLine(line);
        if (mapped) lines.push(mapped);
      }
    }
  }
  return {
    index: image.index,
    width: image.width,
    height: image.height,
    angle: ((data.rotateRadians ?? 0) * 180) / Math.PI,
    lines,
  };
}

function mapLine(line: TessLine): OcrLine | null {
  const tokens = line.words
    .filter((word) => word.text.trim().length > 0)
    .map(mapWord);
  if (tokens.length === 0) return null;
  const box = toBox(line.bbox);
  return {
    text: line.text.trim(),
    // tesseract.js reports a line score that tracks the line's first word,
    // not the line. Use the mean of the tokens, as for every provider.
    confidence: mean(tokens.map((token) => token.confidence)),
    box,
    polygon: quadFromBox(box),
    tokens,
  };
}

function mapWord(word: TessWord): OcrToken {
  const box = toBox(word.bbox);
  return {
    text: word.text,
    confidence: clamp01(word.confidence / 100),
    box,
    polygon: quadFromBox(box),
  };
}

function toBox(bbox: TessBbox): BoundingBox {
  return {
    x: bbox.x0,
    y: bbox.y0,
    width: bbox.x1 - bbox.x0,
    height: bbox.y1 - bbox.y0,
  };
}
