/**
 * Character-level cleanup: the part of reconstruction that needs no geometry.
 */

const RTL_LETTER = /[\p{Script=Arabic}\p{Script=Hebrew}]/u;
const LETTER = /\p{L}/u;
const DIGIT = /\p{Nd}/u;
const MARK = /\p{M}/u;

export function isRtlLetter(char: string): boolean {
  return LETTER.test(char) && RTL_LETTER.test(char);
}

export function isLtrLetter(char: string): boolean {
  return LETTER.test(char) && !RTL_LETTER.test(char);
}

export function isDigit(char: string): boolean {
  return DIGIT.test(char);
}

/** Combining marks: Arabic tashkeel, and anything else that rides on a base. */
export function isMark(char: string): boolean {
  return MARK.test(char);
}

/**
 * Bidi controls and zero-width characters. Engines emit these to make their
 * own plain-text output render (Tesseract wraps Latin runs in LRM/RLM). They
 * are invisible, they break string matching, and direction is carried by
 * explicit runs here, so they go.
 */
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\u061C\uFEFF]/g;

export function stripInvisible(text: string): string {
  return text.replace(INVISIBLE, '');
}

/** Arabic Presentation Forms A and B: one code point per *shape* of a letter. */
const PRESENTATION_FORM = /[\uFB50-\uFDFF\uFE70-\uFEFE]/g;

/**
 * Folds presentation forms back to the letters they are shapes of, so that
 * ﻋ ﻌ ﻊ ﻉ all become ع, and the ligature ﻻ becomes ل + ا.
 *
 * NFKC does this, but applied to the whole string it would also rewrite
 * characters that are not ours to touch, so it is applied to these two blocks
 * only. The spacing forms of tashkeel (U+FE70..FE7F) decompose to a space or a
 * tatweel carrying the mark; only the mark is kept.
 *
 * Must run after visual order has been undone: reversing ل + ا gives a
 * different word than reversing ﻻ.
 */
export function foldPresentationForms(text: string): string {
  return text.replace(PRESENTATION_FORM, (char) =>
    char.normalize('NFKC').replace(/^[ \u0640](?=\p{M})/u, ''),
  );
}

/**
 * A mark with nothing before it has lost its letter, usually to a reversal
 * that moved the marks ahead of their bases. Put leading marks after the first
 * base character.
 */
export function reattachLeadingMarks(text: string): string {
  const chars = [...text];
  let leading = 0;
  while (leading < chars.length && isMark(chars[leading] as string)) leading++;
  if (leading === 0 || leading === chars.length) return text;
  const marks = chars.slice(0, leading);
  const [base, ...rest] = chars.slice(leading);
  return [base, ...marks, ...rest].join('');
}

/**
 * The full character pipeline for one token, in the only order that works:
 * invisibles out, shapes folded to letters, marks given a base, then NFC so
 * that a letter and its hamza or its marks are in canonical order.
 */
export function cleanText(text: string): string {
  return reattachLeadingMarks(
    foldPresentationForms(stripInvisible(text)),
  ).normalize('NFC');
}
