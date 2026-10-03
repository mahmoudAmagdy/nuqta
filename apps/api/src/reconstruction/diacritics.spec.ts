import { insertMarks, isOnlyMarks, stripDiacritics } from './diacritics.js';

const cp = (...codes: number[]) => String.fromCodePoint(...codes);
const FATHA = cp(0x064e);
const DAMMA = cp(0x064f);
const SHADDA = cp(0x0651);
const SUPERSCRIPT_ALEF = cp(0x0670);

describe('stripDiacritics', () => {
  it('removes vowels, tanween, shadda and sukun', () => {
    expect(stripDiacritics('وتُكتَبُ خصيصاً تغيّر مسْح')).toBe(
      'وتكتب خصيصا تغير مسح',
    );
  });

  it('removes the superscript alef', () => {
    expect(stripDiacritics('ه' + 'ذ' + SUPERSCRIPT_ALEF + 'ا')).toBe('هذا');
  });

  it('touches nothing else: letters, hamza forms, digits, Latin', () => {
    const plain = 'أحمد إلى آخر مؤسسة ١٢٣ SKU-1';

    expect(stripDiacritics(plain)).toBe(plain);
  });
});

describe('isOnlyMarks', () => {
  it('spots a token that is a diacritic and nothing else', () => {
    expect(isOnlyMarks(DAMMA)).toBe(true);
    expect(isOnlyMarks(SHADDA + FATHA)).toBe(true);
  });

  it('is false for letters, for a letter with a mark, and for nothing', () => {
    expect(isOnlyMarks('ب')).toBe(false);
    expect(isOnlyMarks('ب' + FATHA)).toBe(false);
    expect(isOnlyMarks('')).toBe(false);
  });
});

describe('insertMarks', () => {
  it('puts the mark on the letter at that fraction of the word', () => {
    expect(insertMarks('كتب', DAMMA, 0)).toBe('ك' + DAMMA + 'تب');
    expect(insertMarks('كتب', DAMMA, 0.5)).toBe('كت' + DAMMA + 'ب');
    expect(insertMarks('كتب', DAMMA, 1)).toBe('كتب' + DAMMA);
  });

  it('goes after marks the letter already carries', () => {
    expect(insertMarks('ك' + SHADDA + 'تب', FATHA, 0)).toBe(
      'ك' + SHADDA + FATHA + 'تب',
    );
  });

  it('counts letters, not code points, when the word has marks', () => {
    // Three letters; the middle one is at the halfway point even though the
    // first carries two marks.
    expect(insertMarks('ك' + SHADDA + FATHA + 'تب', DAMMA, 0.5)).toBe(
      'ك' + SHADDA + FATHA + 'ت' + DAMMA + 'ب',
    );
  });

  it('tolerates a fraction outside 0..1', () => {
    expect(insertMarks('كتب', DAMMA, -3)).toBe('ك' + DAMMA + 'تب');
    expect(insertMarks('كتب', DAMMA, 9)).toBe('كتب' + DAMMA);
  });
});
