import {
  cleanText,
  foldPresentationForms,
  reattachLeadingMarks,
  stripInvisible,
} from './unicode.js';

const cp = (...codes: number[]) => String.fromCodePoint(...codes);
const LRM = cp(0x200e);
const RLM = cp(0x200f);
const FATHA = cp(0x064e);
const SHADDA = cp(0x0651);

describe('stripInvisible', () => {
  it('removes the directional marks Tesseract wraps around Latin runs', () => {
    expect(stripInvisible(`${LRM}SKU-4471-B${RLM}`)).toBe('SKU-4471-B');
  });

  it('removes embeddings, isolates, zero-width characters and the BOM', () => {
    const noisy =
      cp(0x202b) + 'نقطة' + cp(0x202c) + cp(0x2067) + cp(0x200b) + cp(0xfeff);

    expect(stripInvisible(noisy)).toBe('نقطة');
  });
});

describe('foldPresentationForms', () => {
  it('maps every positional shape of a letter back to the letter', () => {
    // ain: isolated, final, initial, medial
    const shapes = [0xfec9, 0xfeca, 0xfecb, 0xfecc].map((code) => cp(code));

    expect(shapes.map(foldPresentationForms)).toEqual(['ع', 'ع', 'ع', 'ع']);
  });

  it('opens the lam-alef ligature into its two letters', () => {
    expect(foldPresentationForms(cp(0xfefb))).toBe('لا');
    expect(foldPresentationForms(cp(0xfef7))).toBe('لأ');
  });

  it('expands a word ligature from Forms-A', () => {
    expect(foldPresentationForms(cp(0xfdf2))).toBe('الله');
  });

  it('keeps the mark of a spacing tashkeel form and drops its carrier', () => {
    // U+FE76 is "fatha, isolated": it decomposes to a space plus the mark.
    expect(foldPresentationForms('ب' + cp(0xfe76))).toBe('ب' + FATHA);
    // U+FE77 is "fatha, medial": a tatweel plus the mark.
    expect(foldPresentationForms('ب' + cp(0xfe77))).toBe('ب' + FATHA);
  });

  it('leaves everything outside the Arabic presentation blocks alone', () => {
    const untouched = 'نقطة ١٢٣ SKU-1 ' + cp(0xfb01) + ' ²';

    expect(foldPresentationForms(untouched)).toBe(untouched);
  });
});

describe('reattachLeadingMarks', () => {
  it('moves marks stranded at the front onto the first letter', () => {
    expect(reattachLeadingMarks(SHADDA + FATHA + 'بت')).toBe(
      'ب' + SHADDA + FATHA + 'ت',
    );
  });

  it('leaves well-formed text and mark-only text unchanged', () => {
    expect(reattachLeadingMarks('بَت')).toBe('بَت');
    expect(reattachLeadingMarks(FATHA)).toBe(FATHA);
  });
});

describe('cleanText', () => {
  it('turns a shaped, mark-wrapped word into plain searchable letters', () => {
    // "العربية" as an engine might emit it: one code point per glyph shape.
    const shaped = cp(0xfe8d, 0xfedf, 0xfecc, 0xfeae, 0xfe91, 0xfef4, 0xfe94);

    expect(cleanText(RLM + shaped + RLM)).toBe('العربية');
  });

  it('composes a letter with its combining hamza', () => {
    const alefThenHamzaAbove = cp(0x0627, 0x0654);

    expect(cleanText(alefThenHamzaAbove + 'حمد')).toBe('أحمد');
    expect(cleanText(alefThenHamzaAbove)).toHaveLength(1);
  });

  it('keeps diacritics and the printed numeral system', () => {
    expect(cleanText('تغيّر ١٢٣٤٥')).toBe('تغيّر ١٢٣٤٥');
  });
});
