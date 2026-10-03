/**
 * Arabic documents use two digit sets, often on the same page: Arabic-Indic
 * (٠١٢٣٤٥٦٧٨٩) and Western (0123456789). Display keeps whichever was printed.
 * Anything that will be compared or added up goes through here first.
 */

const ARABIC_INDIC_ZERO = 0x0660; // ٠, used across the Arab world
const EXTENDED_ZERO = 0x06f0; // ۰, the Persian and Urdu shapes
const NON_WESTERN_DIGIT = /[\u0660-\u0669\u06F0-\u06F9]/g;

export function hasArabicIndicDigits(text: string): boolean {
  NON_WESTERN_DIGIT.lastIndex = 0;
  return NON_WESTERN_DIGIT.test(text);
}

/**
 * Digits to Western, and the Arabic numeric punctuation to its ASCII
 * counterpart: ٫ (decimal) to `.`, ٬ (thousands) to `,`, ٪ to `%`.
 */
export function toWesternDigits(text: string): string {
  return text
    .replace(NON_WESTERN_DIGIT, (digit) => {
      const code = digit.charCodeAt(0);
      const zero = code >= EXTENDED_ZERO ? EXTENDED_ZERO : ARABIC_INDIC_ZERO;
      return String(code - zero);
    })
    .replaceAll('\u066B', '.')
    .replaceAll('\u066C', ',')
    .replaceAll('\u066A', '%');
}

/**
 * Reads a printed amount as a number, or returns null if it is not cleanly
 * one. Returning null matters: a total that fails to parse must surface as a
 * problem, not turn into NaN or a silently truncated value.
 *
 * Accepts either digit set and a sign on either side (in an Arabic line a
 * minus is printed after the digits: `50-`). Separators are read as follows:
 *
 *   both `.` and `,` present   the rightmost is the decimal point
 *   one kind, repeated         grouping: 1,250,000 or 1.250.000
 *   a single `,` + 3 digits    grouping: 1,250
 *   any other single one       decimal:  12.5, 0,75, 1.250
 */
export function parseNumber(text: string): number | null {
  let value = toWesternDigits(text)
    .replace(/[\s\u00A0]/g, '')
    .replaceAll('\u060C', ',');

  let negative = false;
  if (/^[-+\u2212]/.test(value)) {
    negative = value[0] !== '+';
    value = value.slice(1);
  } else if (/[-\u2212]$/.test(value)) {
    negative = true;
    value = value.slice(0, -1);
  }
  if (!/^\d+(?:[.,]\d+)*$/.test(value)) return null;

  const separators = value.match(/[.,]/g) ?? [];
  const parts = value.split(/[.,]/);
  const last = separators.at(-1);
  const lastPart = parts.at(-1) ?? '';

  let groups = parts;
  let fraction = '';
  if (new Set(separators).size === 2) {
    if (separators.filter((s) => s === last).length !== 1) return null;
    groups = parts.slice(0, -1);
    fraction = lastPart;
  } else if (separators.length === 1) {
    const grouping =
      last === ',' && lastPart.length === 3 && (parts[0]?.length ?? 0) <= 3;
    if (!grouping) {
      groups = parts.slice(0, -1);
      fraction = lastPart;
    }
  }

  const wellGrouped =
    groups.length === 1 ||
    ((groups[0]?.length ?? 0) <= 3 &&
      groups.slice(1).every((group) => group.length === 3));
  if (!wellGrouped) return null;

  const parsed = Number(groups.join('') + (fraction ? `.${fraction}` : ''));
  return negative ? -parsed : parsed;
}
