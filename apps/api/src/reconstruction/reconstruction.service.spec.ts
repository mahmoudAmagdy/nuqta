import { quadFromBox, unionBoxes } from '../ocr/geometry.js';
import type {
  OcrDocument,
  OcrLine,
  OcrToken,
  TextOrder,
} from '../ocr/ocr.types.js';
import { parseNumber } from './numerals.js';
import type { ReconstructedLine } from './reconstruction.types.js';
import { ReconstructionService } from './reconstruction.service.js';

const cp = (...codes: number[]) => String.fromCodePoint(...codes);
const LRM = cp(0x200e);
const RLM = cp(0x200f);
const DAMMA = cp(0x064f);
const ARABIC_THOUSANDS = cp(0x066c);
const ARABIC_DECIMAL = cp(0x066b);

/** A token occupying x0..x1 on a line whose top is at y. */
function token(text: string, x0: number, x1: number, y = 0): OcrToken {
  const box = { x: x0, y, width: x1 - x0, height: 40 };
  return { text, confidence: 0.9, box, polygon: quadFromBox(box) };
}

function line(...tokens: OcrToken[]): OcrLine {
  const box = unionBoxes(tokens.map((t) => t.box));
  return {
    // Deliberately useless: reconstruction must not depend on it.
    text: 'provider line text is ignored',
    confidence: 0.9,
    box,
    polygon: quadFromBox(box),
    tokens,
  };
}

function document(
  lines: OcrLine[],
  textOrder: TextOrder = 'logical',
): OcrDocument {
  return {
    provider: 'test',
    textOrder,
    pages: [{ index: 0, width: 1000, height: 600, angle: 0, lines }],
  };
}

function runsOf(reconstructed: ReconstructedLine): string[] {
  return reconstructed.runs.map(
    (run) =>
      `${run.direction}[${reconstructed.text.slice(run.start, run.end)}]`,
  );
}

const service = new ReconstructionService();

/**
 * The hand-checked sample. Five lines of an invoice, each written the way a
 * poor engine would return it, each expectation worked out by hand from how
 * the line would be printed.
 */
describe('ReconstructionService on a hand-checked page', () => {
  // "فاتورة رقم INV-2041", printed with فاتورة at the right edge. Returned as
  // glyph shapes in visual order, words listed left to right, the Latin run
  // wrapped in directional marks, by a provider that claims logical order.
  const header = line(
    token(LRM + 'INV-2041' + LRM, 500, 660, 100),
    token(cp(0xfee2, 0xfed7, 0xfead), 680, 760, 100),
    token(cp(0xfe93, 0xfead, 0xfeee, 0xfe97, 0xfe8e, 0xfed3), 780, 940, 100),
  );

  // "الإجمالي ١٬٢٥٠٫٥٠ جنيه": Arabic-Indic digits with Arabic separators, and
  // the hamza under the alef sent as a separate combining character.
  const total = line(
    token('جنيه', 540, 620, 200),
    token(`١${ARABIC_THOUSANDS}٢٥٠${ARABIC_DECIMAL}٥٠`, 640, 780, 200),
    token('ال' + cp(0x0627, 0x0655) + 'جمالي', 800, 940, 200),
  );

  // "كُتب الدرس": the damma over the kaf came back as a token of its own.
  // كتب spans 800..920 and reads from the right, so the kaf is near 900.
  const vowelled = line(
    token('كتب', 800, 920, 300),
    token(DAMMA, 890, 900, 290),
    token('الدرس', 600, 760, 300),
  );

  // A table row with no letters at all: quantity 3 at the right, then unit
  // price 150, then line total 450 at the left.
  const row = line(
    token('٤٥٠', 480, 540, 400),
    token('١٥٠', 680, 740, 400),
    token('٣', 890, 910, 400),
  );

  // One English line on an Arabic page.
  const english = line(
    token('EGP', 330, 400, 500),
    token('Total', 100, 180, 500),
    token('450', 270, 320, 500),
    token('due:', 190, 260, 500),
  );

  const [page] = service.reconstruct(
    document([header, total, vowelled, row, english]),
  ).pages;
  if (!page) throw new Error('no page');
  const [first, second, third, fourth, fifth] = page.lines;

  it('judges the page to be right-to-left', () => {
    expect(page.direction).toBe('rtl');
    expect(page.lines).toHaveLength(5);
  });

  it('logical order: undoes visual glyph order and visual word order', () => {
    expect(first?.text).toBe('فاتورة رقم INV-2041');
    expect(first?.direction).toBe('rtl');
    expect(first?.tokens.map((t) => t.kind)).toEqual([
      'arabic',
      'arabic',
      'latin',
    ]);
  });

  it('ligatures and shapes: returns letters, not pictures of letters', () => {
    const everything = page.lines.map((l) => l.text).join(' ');

    expect(everything).not.toMatch(/[\uFB50-\uFDFF\uFE70-\uFEFE]/);
    expect(everything).not.toMatch(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/);
    // The provider's own text is kept for audit, untouched.
    expect(first?.tokens[2]?.original).toBe(LRM + 'INV-2041' + LRM);
    expect(first?.tokens[2]?.text).toBe('INV-2041');
  });

  it('bidi: marks the Latin identifier as its own left-to-right run', () => {
    expect(first && runsOf(first)).toEqual([
      'rtl[فاتورة رقم]',
      'ltr[INV-2041]',
    ]);
  });

  it('numerals: displays the printed digits, matches and parses Western', () => {
    const amount = second?.tokens[1];

    expect(second?.text).toBe(
      `الإجمالي ١${ARABIC_THOUSANDS}٢٥٠${ARABIC_DECIMAL}٥٠ جنيه`,
    );
    expect(amount?.kind).toBe('number');
    expect(amount?.search).toBe('1,250.50');
    expect(parseNumber(amount?.text ?? '')).toBe(1250.5);
    expect(second && runsOf(second)).toEqual([
      'rtl[الإجمالي]',
      `ltr[١${ARABIC_THOUSANDS}٢٥٠${ARABIC_DECIMAL}٥٠]`,
      'rtl[جنيه]',
    ]);
  });

  it('hamza: composes the letter for display, folds it for search', () => {
    expect(second?.tokens[0]?.text).toBe('الإجمالي');
    expect(second?.tokens[0]?.text).toHaveLength(8);
    expect(second?.search).toBe('الاجمالي 1,250.50 جنيه');
  });

  it('diacritics: gives a stray mark back to the letter it was printed on', () => {
    expect(third?.tokens).toHaveLength(2);
    expect(third?.text).toBe('ك' + DAMMA + 'تب الدرس');
    expect(third?.search).toBe('كتب الدرس');
    // The word's box grows to cover the mark, so highlighting still fits.
    expect(third?.tokens[0]?.box).toEqual({
      x: 800,
      y: 290,
      width: 120,
      height: 50,
    });
  });

  it('a line with no letters reads in the direction of its page', () => {
    expect(fourth?.direction).toBe('rtl');
    expect(fourth?.text).toBe('٣ ١٥٠ ٤٥٠');
    expect(fourth && runsOf(fourth)).toEqual([
      'ltr[٣]',
      'ltr[١٥٠]',
      'ltr[٤٥٠]',
    ]);
  });

  it('an English line on an Arabic page is still read left to right', () => {
    expect(fifth?.direction).toBe('ltr');
    expect(fifth?.text).toBe('Total due: 450 EGP');
    expect(fifth && runsOf(fifth)).toEqual(['ltr[Total due: 450 EGP]']);
  });

  it('keeps every token tied to its place on the page', () => {
    expect(first?.tokens[0]?.box).toEqual({
      x: 780,
      y: 100,
      width: 160,
      height: 40,
    });
    expect(first?.box).toEqual(header.box);
  });
});

describe('ReconstructionService', () => {
  it('reverses plain letters when the provider says its text is visual', () => {
    const visual = document(
      [line(token('SKU-1', 100, 200), token('ةطقن', 300, 400))],
      'visual',
    );

    const [reconstructed] = service.reconstruct(visual).pages[0]?.lines ?? [];

    expect(reconstructed?.text).toBe('نقطة SKU-1');
  });

  it('believes the shapes over the provider when they disagree', () => {
    // Shaped "رقم" in reading order, from a provider that claims visual.
    const shaped = document(
      [line(token(cp(0xfead, 0xfed7, 0xfee2), 300, 400))],
      'visual',
    );

    expect(service.reconstruct(shaped).pages[0]?.lines[0]?.text).toBe('رقم');
  });

  it('splits a word that mixes scripts into directional runs', () => {
    const mixed = document([
      line(token('رقم:INV-2041', 300, 600), token('الفاتورة', 700, 900)),
    ]);

    const [reconstructed] = service.reconstruct(mixed).pages[0]?.lines ?? [];

    expect(reconstructed?.tokens[1]?.kind).toBe('mixed');
    expect(reconstructed && runsOf(reconstructed)).toEqual([
      'rtl[الفاتورة رقم:]',
      'ltr[INV-2041]',
    ]);
  });

  it('drops tokens and lines that were nothing but invisible characters', () => {
    const noise = document([
      line(token(LRM + RLM, 100, 110)),
      line(token(RLM, 100, 110), token('نقطة', 300, 400)),
    ]);

    const lines = service.reconstruct(noise).pages[0]?.lines ?? [];

    expect(lines).toHaveLength(1);
    expect(lines[0]?.tokens.map((t) => t.text)).toEqual(['نقطة']);
  });

  it('defaults an entirely numeric page to right-to-left', () => {
    const numeric = document([
      line(token('450', 100, 200), token('3', 800, 850)),
    ]);

    const [page] = service.reconstruct(numeric).pages;

    expect(page?.direction).toBe('rtl');
    expect(page?.lines[0]?.text).toBe('3 450');
  });

  it('carries the provider name and page identity through', () => {
    const result = service.reconstruct(document([]));

    expect(result).toEqual({
      provider: 'test',
      pages: [
        {
          index: 0,
          width: 1000,
          height: 600,
          angle: 0,
          direction: 'rtl',
          lines: [],
        },
      ],
    });
  });
});
