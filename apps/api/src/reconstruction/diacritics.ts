import { isMark } from './unicode.js';

/**
 * Tashkeel: the short vowels, tanween, shadda and sukun, plus the Quranic
 * annotation marks and the superscript alef. They are part of the text. A book
 * that carries them means them, and dropping one changes the word.
 */
const DIACRITICS =
  /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g;

/** For consumers that asked for plain text. Never applied silently. */
export function stripDiacritics(text: string): string {
  return text.replace(DIACRITICS, '');
}

export function isOnlyMarks(text: string): boolean {
  const chars = [...text];
  return chars.length > 0 && chars.every(isMark);
}

/**
 * Inserts marks into a word after the letter at `fraction` of the way through
 * it (0 = first letter, 1 = last). Used when an engine reported a diacritic as
 * its own token: the mark's position on the page says which letter it sat on.
 */
export function insertMarks(
  word: string,
  marks: string,
  fraction: number,
): string {
  const chars = [...word];
  const baseIndexes = chars.flatMap((char, i) => (isMark(char) ? [] : [i]));
  if (baseIndexes.length === 0) return word + marks;

  const clamped = Math.min(1, Math.max(0, fraction));
  const target = Math.min(
    baseIndexes.length - 1,
    Math.floor(clamped * baseIndexes.length),
  );
  // After the base and after any marks it already carries.
  let at = (baseIndexes[target] as number) + 1;
  while (at < chars.length && isMark(chars[at] as string)) at++;

  return [...chars.slice(0, at), marks, ...chars.slice(at)].join('');
}
