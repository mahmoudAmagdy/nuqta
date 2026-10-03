import {
  boxFromPoints,
  clamp01,
  mean,
  quadFromBox,
  quadFromFlat,
  unionBoxes,
} from '../../geometry.js';
import type { OcrLine, OcrPage, OcrToken, PageImage } from '../../ocr.types.js';
import type {
  AzureAnalyzeResult,
  AzureLine,
  AzureSpan,
  AzureWord,
} from './azure-read.types.js';

/**
 * Azure returns words and lines as two flat lists that both point into one
 * `content` string. A word belongs to the line whose span contains it.
 */
export function mapAzureReadResult(
  result: AzureAnalyzeResult,
  image: PageImage,
): OcrPage {
  const page = result.pages?.[0];
  if (!page) {
    return {
      index: image.index,
      width: image.width,
      height: image.height,
      angle: 0,
      lines: [],
    };
  }

  // Images come back in pixels already. Guard the scale anyway so a PDF-sized
  // (inch) page can never silently produce boxes in the wrong coordinate space.
  const scaleX = page.width ? image.width / page.width : 1;
  const scaleY = page.height ? image.height / page.height : 1;

  const words = [...(page.words ?? [])].sort(
    (a, b) => a.span.offset - b.span.offset,
  );
  const lines = (page.lines ?? [])
    .map((line) => mapLine(line, words, scaleX, scaleY))
    .filter((line): line is OcrLine => line !== null);

  return {
    index: image.index,
    width: image.width,
    height: image.height,
    angle: page.angle ?? 0,
    lines,
  };
}

function mapLine(
  line: AzureLine,
  words: AzureWord[],
  scaleX: number,
  scaleY: number,
): OcrLine | null {
  const tokens = words
    .filter((word) => line.spans.some((span) => contains(span, word.span)))
    .map((word) => mapWord(word, scaleX, scaleY))
    .filter((token): token is OcrToken => token !== null);
  if (tokens.length === 0) return null;

  const polygon = scaledQuad(line.polygon, scaleX, scaleY);
  const box = polygon
    ? boxFromPoints(polygon)
    : unionBoxes(tokens.map((token) => token.box));

  return {
    text: line.content,
    confidence: mean(tokens.map((token) => token.confidence)),
    box,
    polygon: polygon ?? quadFromBox(box),
    tokens,
  };
}

function mapWord(
  word: AzureWord,
  scaleX: number,
  scaleY: number,
): OcrToken | null {
  const polygon = scaledQuad(word.polygon, scaleX, scaleY);
  // A token without geometry cannot be highlighted, so it is not a token.
  if (!polygon) return null;
  return {
    text: word.content,
    confidence: clamp01(word.confidence ?? 0),
    box: boxFromPoints(polygon),
    polygon,
  };
}

function scaledQuad(
  flat: number[] | undefined,
  scaleX: number,
  scaleY: number,
) {
  const quad = flat ? quadFromFlat(flat) : null;
  if (!quad) return null;
  for (const point of quad) {
    point.x *= scaleX;
    point.y *= scaleY;
  }
  return quad;
}

function contains(outer: AzureSpan, inner: AzureSpan): boolean {
  return (
    inner.offset >= outer.offset &&
    inner.offset + inner.length <= outer.offset + outer.length
  );
}
