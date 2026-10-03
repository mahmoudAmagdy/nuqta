import { Injectable } from '@nestjs/common';
import { mean, quadFromBox, unionBoxes } from '../ocr/geometry.js';
import type {
  OcrDocument,
  OcrLine,
  OcrPage,
  OcrToken,
  TextOrder,
} from '../ocr/ocr.types.js';
import { insertMarks, isOnlyMarks } from './diacritics.js';
import { toSearchForm } from './folding.js';
import type {
  Direction,
  DirectionalRun,
  ReconstructedDocument,
  ReconstructedLine,
  ReconstructedPage,
  ReconstructedToken,
  TokenKind,
} from './reconstruction.types.js';
import {
  classifyToken,
  detectDirection,
  orderTokens,
  splitMixedToken,
} from './token-order.js';
import type { OrderedToken } from './token-order.js';
import {
  cleanText,
  isDigit,
  isLtrLetter,
  isRtlLetter,
  stripInvisible,
} from './unicode.js';
import { orderFromShapes, visualToLogical } from './visual-order.js';

/** A token after character cleanup, before it has a place in the line. */
type CleanToken = Pick<OcrToken, 'confidence' | 'box' | 'polygon'> & {
  text: string;
  original: string;
};

/**
 * Stage 4. Turns whatever a provider returned into text that is correct as
 * Arabic: logical order, real letters instead of glyph shapes, diacritics on
 * their letters, words in reading order, and explicit directional runs.
 *
 * Everything Arabic-specific happens here and nowhere else. An adapter that
 * needs something from this stage gets it for every document type, or not at
 * all.
 */
@Injectable()
export class ReconstructionService {
  reconstruct(document: OcrDocument): ReconstructedDocument {
    return {
      provider: document.provider,
      pages: document.pages.map((page) =>
        this.reconstructPage(page, document.textOrder),
      ),
    };
  }

  private reconstructPage(
    page: OcrPage,
    claimed: TextOrder,
  ): ReconstructedPage {
    const cleaned = page.lines.map((line) => ({
      line,
      tokens: attachOrphanMarks(
        line.tokens
          .map((token) => cleanToken(token, claimed))
          .filter((token) => token.text.length > 0),
      ),
    }));

    // A line with no letters (a row of amounts, a page number) reads in the
    // direction of the page it is on.
    const pageDirection =
      detectDirection(
        cleaned.flatMap(({ tokens }) => tokens.map((token) => token.text)),
      ) ?? 'rtl';

    return {
      index: page.index,
      width: page.width,
      height: page.height,
      angle: page.angle,
      direction: pageDirection,
      lines: cleaned
        .filter(({ tokens }) => tokens.length > 0)
        .map(({ line, tokens }) => buildLine(line, tokens, pageDirection)),
    };
  }
}

function cleanToken(token: OcrToken, claimed: TextOrder): CleanToken {
  let text = stripInvisible(token.text);
  // The shapes outrank the provider's claim. Only Arabic can be backwards.
  const order = orderFromShapes(text) ?? claimed;
  if (order === 'visual' && [...text].some(isRtlLetter)) {
    text = visualToLogical(text);
  }
  return {
    text: cleanText(text),
    original: token.text,
    confidence: token.confidence,
    box: token.box,
    polygon: token.polygon,
  };
}

/**
 * A diacritic reported as a token of its own is given back to the word it was
 * printed on: the nearest word horizontally, at the letter under the mark.
 */
function attachOrphanMarks(tokens: CleanToken[]): CleanToken[] {
  const words = tokens.filter((token) => !isOnlyMarks(token.text));
  if (words.length === tokens.length || words.length === 0) return words;

  for (const mark of tokens.filter((token) => isOnlyMarks(token.text))) {
    const x = mark.box.x + mark.box.width / 2;
    const distance = (word: CleanToken) =>
      Math.max(word.box.x - x, x - (word.box.x + word.box.width), 0);
    const host = words.reduce((best, word) =>
      distance(word) < distance(best) ? word : best,
    );

    const fromLeft = host.box.width ? (x - host.box.x) / host.box.width : 0;
    const rtl = classifyToken(host.text) === 'rtl';
    host.text = insertMarks(
      host.text,
      mark.text,
      rtl ? 1 - fromLeft : fromLeft,
    ).normalize('NFC');
    host.original += mark.original;
    host.confidence = Math.min(host.confidence, mark.confidence);
    host.box = unionBoxes([host.box, mark.box]);
    host.polygon = quadFromBox(host.box);
  }
  return words;
}

function buildLine(
  line: OcrLine,
  tokens: CleanToken[],
  pageDirection: Direction,
): ReconstructedLine {
  const direction =
    detectDirection(tokens.map((token) => token.text)) ?? pageDirection;

  const ordered = orderTokens(
    tokens.map((token) => ({
      item: token,
      x: token.box.x + token.box.width / 2,
      tokenClass: classifyToken(token.text),
    })),
    direction,
  );

  const reconstructed = ordered.map(({ item }) => toToken(item));
  return {
    text: reconstructed.map((token) => token.text).join(' '),
    search: reconstructed.map((token) => token.search).join(' '),
    direction,
    runs: buildRuns(ordered),
    tokens: reconstructed,
    confidence: mean(reconstructed.map((token) => token.confidence)),
    box: line.box,
    polygon: line.polygon,
  };
}

function toToken(token: CleanToken): ReconstructedToken {
  return {
    text: token.text,
    search: toSearchForm(token.text),
    original: token.original,
    kind: kindOf(token.text),
    confidence: token.confidence,
    box: token.box,
    polygon: token.polygon,
  };
}

function kindOf(text: string): TokenKind {
  const chars = [...text];
  const rtl = chars.some(isRtlLetter);
  const ltr = chars.some(isLtrLetter);
  const digit = chars.some(isDigit);
  if (rtl) return ltr || digit ? 'mixed' : 'arabic';
  if (ltr) return 'latin';
  return digit ? 'number' : 'punctuation';
}

/**
 * Lays the ordered tokens out as one string and records where each
 * directional run starts and ends in it. Words of one group share a run,
 * space included. A word that mixes scripts contributes one run per piece.
 */
function buildRuns(ordered: OrderedToken<CleanToken>[]): DirectionalRun[] {
  const runs: (DirectionalRun & { group: number })[] = [];
  let offset = 0;
  let mixedGroup = -1;

  const add = (length: number, direction: Direction, group: number) => {
    const previous = runs.at(-1);
    if (
      previous &&
      previous.group === group &&
      previous.direction === direction
    ) {
      previous.end = offset + length;
    } else {
      runs.push({ start: offset, end: offset + length, direction, group });
    }
    offset += length;
  };

  ordered.forEach(({ item, direction, group }, index) => {
    if (index > 0) offset += 1; // the joining space
    if (kindOf(item.text) !== 'mixed') {
      add(item.text.length, direction, group);
      return;
    }
    for (const piece of splitMixedToken(item.text)) {
      // The Arabic pieces belong to the surrounding run; a Latin or numeric
      // piece inside the word is a run of its own.
      const own = piece.direction !== direction;
      add(piece.text.length, piece.direction, own ? mixedGroup-- : group);
    }
  });

  return runs.map(({ start, end, direction }) => ({ start, end, direction }));
}
