import { isDigit, isLtrLetter, isMark, isRtlLetter } from './unicode.js';

/**
 * Character order inside a token.
 *
 * Arabic is stored first-letter-first ("logical"). Some engines and most PDF
 * text layers instead emit the letters in the order they sit on the page, left
 * to right ("visual"), which for Arabic is backwards. The result renders
 * correctly in a naive left-to-right viewer and is reversed everywhere else.
 */

type Form = 'isolated' | 'final' | 'initial' | 'medial';

/**
 * Arabic Presentation Forms-B lays each letter's shapes out in a fixed order:
 * isolated, final, then (for letters that join on both sides) initial, medial.
 * [first code point, number of shapes].
 */
const FORMS_B_LETTERS: readonly (readonly [number, 1 | 2 | 4])[] = [
  [0xfe80, 1],
  [0xfe81, 2],
  [0xfe83, 2],
  [0xfe85, 2],
  [0xfe87, 2],
  [0xfe89, 4],
  [0xfe8d, 2],
  [0xfe8f, 4],
  [0xfe93, 2],
  [0xfe95, 4],
  [0xfe99, 4],
  [0xfe9d, 4],
  [0xfea1, 4],
  [0xfea5, 4],
  [0xfea9, 2],
  [0xfeab, 2],
  [0xfead, 2],
  [0xfeaf, 2],
  [0xfeb1, 4],
  [0xfeb5, 4],
  [0xfeb9, 4],
  [0xfebd, 4],
  [0xfec1, 4],
  [0xfec5, 4],
  [0xfec9, 4],
  [0xfecd, 4],
  [0xfed1, 4],
  [0xfed5, 4],
  [0xfed9, 4],
  [0xfedd, 4],
  [0xfee1, 4],
  [0xfee5, 4],
  [0xfee9, 4],
  [0xfeed, 2],
  [0xfeef, 2],
  [0xfef1, 4],
  [0xfef5, 2],
  [0xfef7, 2],
  [0xfef9, 2],
  [0xfefb, 2],
];

const FORM_ORDER: readonly Form[] = ['isolated', 'final', 'initial', 'medial'];

const FORM_BY_CODE_POINT: ReadonlyMap<number, Form> = new Map(
  FORMS_B_LETTERS.flatMap(([first, count]) =>
    Array.from(
      { length: count },
      (_, i) => [first + i, FORM_ORDER[i] as Form] as const,
    ),
  ),
);

export function presentationForm(char: string): Form | null {
  return FORM_BY_CODE_POINT.get(char.codePointAt(0) ?? -1) ?? null;
}

/**
 * Reads character order off the shapes themselves, with no dictionary.
 *
 * Arabic joining is a constraint that only holds in one direction. A letter in
 * its initial or medial shape must be followed by one in its medial or final
 * shape, and a medial or final shape must have one of those before it. Count
 * how often that is violated reading the string forwards, and how often
 * reading it backwards; the reading with fewer violations is the logical one.
 *
 * A string with no presentation forms breaks no rules either way and the
 * answer is null: the shapes have nothing to say.
 */
export function orderFromShapes(text: string): 'logical' | 'visual' | null {
  const forms = [...text].filter((char) => !isMark(char)).map(presentationForm);

  const forwards = joiningViolations(forms);
  const backwards = joiningViolations(forms.toReversed());
  if (forwards === backwards) return null;
  return backwards < forwards ? 'visual' : 'logical';
}

function joiningViolations(forms: readonly (Form | null)[]): number {
  const joinsNext = (form: Form | null | undefined) =>
    form === 'initial' || form === 'medial';
  const joinsPrevious = (form: Form | null | undefined) =>
    form === 'final' || form === 'medial';

  let violations = 0;
  forms.forEach((form, i) => {
    if (joinsNext(form) && !joinsPrevious(forms[i + 1])) violations++;
    if (joinsPrevious(form) && !joinsNext(forms[i - 1])) violations++;
  });
  return violations;
}

/**
 * Turns a visually ordered token into logical order.
 *
 * The right-to-left letters are reversed. Digits and Latin letters inside the
 * token were already left-to-right on the page and in the string, so each such
 * stretch is put back the way it was. A base letter and its marks move as one.
 */
export function visualToLogical(text: string): string {
  const reversed = clusters(text).reverse();

  const result: string[] = [];
  let ltr: string[] = [];
  const flush = () => {
    result.push(...ltr.reverse());
    ltr = [];
  };
  for (const cluster of reversed) {
    const base = [...cluster][0] ?? '';
    if (isDigit(base) || isLtrLetter(base)) {
      ltr.push(cluster);
    } else if (ltr.length > 0 && !isRtlLetter(base) && isJoiner(base)) {
      // Punctuation inside a number or an identifier: 4471-B, 12.5
      ltr.push(cluster);
    } else {
      flush();
      result.push(cluster);
    }
  }
  flush();
  return result.join('');
}

function isJoiner(char: string): boolean {
  return /[.,:/\-_+#%]/.test(char);
}

/**
 * Splits into base-plus-marks units. If the string opens with a mark, it was
 * produced by reversing code points one by one, which leaves every mark in
 * front of its letter; in that case a mark belongs to the letter after it.
 */
function clusters(text: string): string[] {
  const chars = [...text];
  const marksLead = chars.length > 0 && isMark(chars[0] as string);
  const units: string[] = [];

  if (marksLead) {
    let pending = '';
    for (const char of chars) {
      if (isMark(char)) pending += char;
      else {
        units.push(char + pending);
        pending = '';
      }
    }
    if (pending) units.push(pending);
    return units;
  }

  for (const char of chars) {
    if (isMark(char) && units.length > 0) units[units.length - 1] += char;
    else units.push(char);
  }
  return units;
}
