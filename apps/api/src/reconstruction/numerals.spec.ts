import {
  hasArabicIndicDigits,
  parseNumber,
  toWesternDigits,
} from './numerals.js';

const cp = (...codes: number[]) => String.fromCodePoint(...codes);
const ARABIC_DECIMAL = cp(0x066b);
const ARABIC_THOUSANDS = cp(0x066c);
const ARABIC_PERCENT = cp(0x066a);
const ARABIC_COMMA = cp(0x060c);
const MINUS = cp(0x2212);
const NBSP = cp(0x00a0);

describe('toWesternDigits', () => {
  it('converts Arabic-Indic digits', () => {
    expect(toWesternDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
  });

  it('converts the Persian and Urdu digit shapes too', () => {
    expect(toWesternDigits('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789');
  });

  it('converts Arabic numeric punctuation', () => {
    const printed = `١${ARABIC_THOUSANDS}٢٥٠${ARABIC_DECIMAL}٥٠ ١٤${ARABIC_PERCENT}`;

    expect(toWesternDigits(printed)).toBe('1,250.50 14%');
  });

  it('leaves the words around the digits alone', () => {
    expect(toWesternDigits('الإجمالي ١٢٥٠ جنيه SKU-4471')).toBe(
      'الإجمالي 1250 جنيه SKU-4471',
    );
  });
});

describe('hasArabicIndicDigits', () => {
  it('distinguishes the two digit sets', () => {
    expect(hasArabicIndicDigits('١٢٥٠')).toBe(true);
    expect(hasArabicIndicDigits('1250')).toBe(false);
    // Called twice on purpose: a global regex must not remember its position.
    expect(hasArabicIndicDigits('١٢٥٠')).toBe(true);
  });
});

describe('parseNumber', () => {
  it.each([
    ['1250', 1250],
    ['١٢٥٠', 1250],
    ['۱۲۳', 123],
    ['0.75', 0.75],
    ['12.5', 12.5],
    ['1,250', 1250],
    ['1,250,000', 1250000],
    ['1,250.50', 1250.5],
    [`١${ARABIC_THOUSANDS}٢٥٠${ARABIC_DECIMAL}٥٠`, 1250.5],
    // European grouping, common on invoices from North Africa.
    ['1.250,50', 1250.5],
    ['1.250.000', 1250000],
    ['12,5', 12.5],
    ['0,75', 0.75],
    // The Arabic comma used as a separator.
    [`1${ARABIC_COMMA}250`, 1250],
    [`1${NBSP}250`, 1250],
    ['-50', -50],
    [`${MINUS}50`, -50],
    ['+50', 50],
    // In a right-to-left line the sign is printed after the digits.
    ['50-', -50],
    ['٥٠-', -50],
  ])('reads %s as %d', (text, expected) => {
    expect(parseNumber(text)).toBe(expected);
  });

  it.each([
    [''],
    ['abc'],
    ['12a'],
    ['SKU-4471'],
    ['03-10-2026'],
    ['1..2'],
    ['1,25,000'],
    ['1,250.50.25'],
    ['12.'],
    ['.5'],
    ['١٢٥٠ جنيه'],
  ])('refuses %j rather than guess', (text) => {
    expect(parseNumber(text)).toBeNull();
  });
});
