import { stripDiacritics } from './diacritics.js';
import { toWesternDigits } from './numerals.js';

/**
 * The matching form of a piece of text: what two spellings of the same word
 * should both collapse to. It is for comparison and search only. Display text
 * is never folded, because every one of these distinctions is real to a reader.
 *
 * The first three rules, and the removal of tatweel and tashkeel, are those of
 * Lucene's ArabicNormalizer, which is what most Arabic search ends up using.
 * The last three are additions that OCR output makes necessary.
 *
 *   آ أ إ  ->  ا    hamza and madda carriers are written inconsistently
 *   ى      ->  ي    Egyptian typography prints final yeh without its dots
 *   ة      ->  ه    final teh marbuta and heh are confused in print
 *
 *   ٱ      ->  ا    alef wasla, as the other alef carriers
 *   ی      ->  ي    Farsi yeh, which engines emit for Arabic yeh
 *   ک      ->  ك    Farsi keheh, likewise for kaf
 *
 * and then, beyond letters: digits to Western, Latin to lower case.
 */
const FOLDS: Record<string, string> = {
  '\u0622': '\u0627', // آ
  '\u0623': '\u0627', // أ
  '\u0625': '\u0627', // إ
  '\u0671': '\u0627', // ٱ
  '\u0649': '\u064A', // ى
  '\u0629': '\u0647', // ة
  '\u06CC': '\u064A', // ی
  '\u06A9': '\u0643', // ک
};
const FOLDABLE = new RegExp(`[${Object.keys(FOLDS).join('')}]`, 'g');
const TATWEEL = /\u0640/g;

export function toSearchForm(text: string): string {
  return toWesternDigits(stripDiacritics(text.normalize('NFC')))
    .replace(TATWEEL, '')
    .replace(FOLDABLE, (char) => FOLDS[char] as string)
    .toLowerCase();
}
