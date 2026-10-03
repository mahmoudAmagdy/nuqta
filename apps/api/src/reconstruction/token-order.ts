import type { Direction } from './reconstruction.types.js';
import { isDigit, isLtrLetter, isMark, isRtlLetter } from './unicode.js';

/**
 * Word order inside a line.
 *
 * Providers disagree about the order they list a line's words in, so that
 * order is ignored. The one thing every provider agrees on is where each word
 * sits on the page, and reading order can be rebuilt from that:
 *
 *   - In a right-to-left line, the reader starts at the right edge.
 *   - A stretch of Latin words inside it is read left to right, as a block,
 *     where it stands. So is a number sitting next to those words.
 *   - A number on its own is one unit, read where it stands.
 *
 * and the mirror image for a left-to-right line with Arabic inside it.
 *
 * This is the Unicode bidi algorithm run backwards, at word granularity. It is
 * checked against a reference implementation of the forward algorithm in the
 * tests.
 */

export type TokenClass = 'rtl' | 'ltr' | 'number' | 'neutral';

/** A word containing any Arabic letter reads right to left, whatever else is in it. */
export function classifyToken(text: string): TokenClass {
  let ltr = false;
  let digit = false;
  for (const char of text) {
    if (isRtlLetter(char)) return 'rtl';
    if (isLtrLetter(char)) ltr = true;
    else if (isDigit(char)) digit = true;
  }
  return ltr ? 'ltr' : digit ? 'number' : 'neutral';
}

/**
 * Majority of letters, not the first letter. The Unicode default (first strong
 * character) is wrong for OCR: an Arabic invoice line that opens with a Latin
 * part number is still an Arabic line. Returns null when there are no letters
 * to judge by, so the caller can fall back to the page.
 */
export function detectDirection(texts: Iterable<string>): Direction | null {
  let rtl = 0;
  let ltr = 0;
  for (const text of texts) {
    for (const char of text) {
      if (isRtlLetter(char)) rtl++;
      else if (isLtrLetter(char)) ltr++;
    }
  }
  if (rtl === 0 && ltr === 0) return null;
  return rtl >= ltr ? 'rtl' : 'ltr';
}

export interface Placed<T> {
  item: T;
  /** Horizontal centre on the page. */
  x: number;
  tokenClass: TokenClass;
}

export interface OrderedToken<T> {
  item: T;
  direction: Direction;
  /** Tokens sharing a group form one directional run. */
  group: number;
}

export function orderTokens<T>(
  tokens: readonly Placed<T>[],
  base: Direction,
): OrderedToken<T>[] {
  const opposite: Direction = base === 'rtl' ? 'ltr' : 'rtl';
  // Start from the edge the reader starts from.
  const sequence = [...tokens].sort((a, b) =>
    base === 'rtl' ? b.x - a.x : a.x - b.x,
  );

  const ordered: OrderedToken<T>[] = [];
  let group = 0;
  let lastWasBase = false;
  const pushBase = (token: Placed<T>) => {
    if (!lastWasBase) group++;
    ordered.push({ item: token.item, direction: base, group });
    lastWasBase = true;
  };
  const pushIsland = (island: Placed<T>[], direction: Direction) => {
    group++;
    for (const token of island) {
      ordered.push({ item: token.item, direction, group });
    }
    lastWasBase = false;
  };

  // Walk the stretches that lie between words of the base direction.
  let stretch: Placed<T>[] = [];
  const flush = () => {
    if (stretch.length === 0) return;

    if (!stretch.some((token) => token.tokenClass === opposite)) {
      // No foreign words here. In an Arabic line a bare number is still a
      // left-to-right unit of its own; in a Latin line it is just a word.
      for (const token of stretch) {
        if (base === 'rtl' && token.tokenClass === 'number') {
          pushIsland([token], 'ltr');
        } else {
          pushBase(token);
        }
      }
    } else {
      // Latin words pull adjacent numbers into their block. Arabic words in a
      // Latin line do not: a number there belongs to the surrounding text.
      const joins = (token: Placed<T>) =>
        token.tokenClass === opposite ||
        (base === 'rtl' && token.tokenClass === 'number');
      const first = stretch.findIndex(joins);
      const last = stretch.findLastIndex(joins);

      stretch.slice(0, first).forEach(pushBase);
      pushIsland(stretch.slice(first, last + 1).reverse(), opposite);
      stretch.slice(last + 1).forEach(pushBase);
    }
    stretch = [];
  };

  for (const token of sequence) {
    if (token.tokenClass === base) {
      flush();
      pushBase(token);
    } else {
      stretch.push(token);
    }
  }
  flush();

  return ordered;
}

export interface TextPiece {
  text: string;
  direction: Direction;
}

/**
 * Splits one word that mixes scripts, such as `رقم:INV-2041`, into the pieces
 * that read in different directions. Same rule as between words: a stretch of
 * Latin letters and digits is one left-to-right piece, punctuation at its
 * edges stays with the Arabic.
 */
export function splitMixedToken(text: string): TextPiece[] {
  const pieces: TextPiece[] = [];
  const push = (chars: string[], direction: Direction) => {
    if (chars.length === 0) return;
    const previous = pieces.at(-1);
    if (previous?.direction === direction) previous.text += chars.join('');
    else pieces.push({ text: chars.join(''), direction });
  };
  const isCore = (char: string) => isLtrLetter(char) || isDigit(char);

  // Stretches of everything that is not an Arabic letter (or a mark on one).
  let stretch: string[] = [];
  const flush = () => {
    const first = stretch.findIndex(isCore);
    if (first < 0) {
      push(stretch, 'rtl');
    } else {
      const last = stretch.findLastIndex(isCore);
      push(stretch.slice(0, first), 'rtl');
      push(stretch.slice(first, last + 1), 'ltr');
      push(stretch.slice(last + 1), 'rtl');
    }
    stretch = [];
  };

  let inArabic = false;
  for (const char of text) {
    inArabic = isRtlLetter(char) || (inArabic && isMark(char));
    if (inArabic) {
      flush();
      push([char], 'rtl');
    } else {
      stretch.push(char);
    }
  }
  flush();
  return pieces;
}
