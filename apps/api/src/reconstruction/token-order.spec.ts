import * as bidiModule from 'bidi-js';
import type { Bidi } from 'bidi-js';
import type { Direction } from './reconstruction.types.js';
import {
  classifyToken,
  detectDirection,
  orderTokens,
  splitMixedToken,
} from './token-order.js';
import type { Placed } from './token-order.js';

/** Words as they sit on the page, left to right, 100px apart. */
function onPage(...leftToRight: string[]): Placed<string>[] {
  return leftToRight.map((item, i) => ({
    item,
    x: i * 100,
    tokenClass: classifyToken(item),
  }));
}

/**
 * Providers list words in no dependable order, so tests scramble them: a
 * fixed permutation, stepping through the list by a stride coprime to its
 * length.
 */
function scrambled<T>(items: T[]): T[] {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const n = items.length;
  const stride = [7, 5, 3, 2, 1].find((step) => gcd(step, n) === 1) ?? 1;
  return items.map((_, i) => items[(i * stride + 3) % n] as T);
}

function read(tokens: Placed<string>[], base: Direction): string {
  return orderTokens(scrambled(tokens), base)
    .map((token) => token.item)
    .join(' ');
}

function runs(tokens: Placed<string>[], base: Direction): string[] {
  const groups = new Map<number, string[]>();
  let direction = new Map<number, Direction>();
  for (const token of orderTokens(tokens, base)) {
    groups.set(token.group, [...(groups.get(token.group) ?? []), token.item]);
    direction = direction.set(token.group, token.direction);
  }
  return [...groups].map(
    ([group, words]) => `${direction.get(group)}[${words.join(' ')}]`,
  );
}

describe('classifyToken', () => {
  it.each([
    ['نقطة', 'rtl'],
    ['رقم:INV-2041', 'rtl'],
    ['SKU-4471-B', 'ltr'],
    ['2026-10-03', 'number'],
    ['١٢٣٤٥', 'number'],
    ['50%', 'number'],
    ['«', 'neutral'],
    [':', 'neutral'],
  ])('%s is %s', (text, expected) => {
    expect(classifyToken(text)).toBe(expected);
  });
});

describe('detectDirection', () => {
  it('goes with the majority of letters, not the first one', () => {
    // An Arabic line that opens with a Latin part number is still Arabic.
    expect(detectDirection(['SKU-4471-B', 'مسمار', 'حديد', 'مجلفن'])).toBe(
      'rtl',
    );
    expect(detectDirection(['The', 'word', 'كتاب', 'means', 'book'])).toBe(
      'ltr',
    );
  });

  it('abstains on a line with no letters', () => {
    expect(detectDirection(['١٢٥٠', '3', '450.00'])).toBeNull();
  });
});

describe('orderTokens in a right-to-left line', () => {
  it('reads from the right edge, whatever order the provider listed', () => {
    // Printed: النقطة rightmost, المعنى leftmost.
    expect(read(onPage('المعنى', 'تغيّر', 'التي', 'النقطة'), 'rtl')).toBe(
      'النقطة التي تغيّر المعنى',
    );
  });

  it('reads a stretch of Latin words left to right, in place', () => {
    // Printed: للتجارة Nile Tech شركة
    expect(read(onPage('للتجارة', 'Nile', 'Tech', 'شركة'), 'rtl')).toBe(
      'شركة Nile Tech للتجارة',
    );
  });

  it('keeps a number with the Latin words it sits next to', () => {
    // Printed: نهاية SKU 4471 B كود
    const line = onPage('نهاية', 'SKU', '4471', 'B', 'كود');

    expect(read(line, 'rtl')).toBe('كود SKU 4471 B نهاية');
    expect(runs(line, 'rtl')).toEqual([
      'rtl[كود]',
      'ltr[SKU 4471 B]',
      'rtl[نهاية]',
    ]);
  });

  it('treats each bare number as its own unit, read from the right', () => {
    // A row of an invoice table. Printed: 450 150 3, with 3 nearest the
    // right edge, so the quantity is read first.
    const row = onPage('450', '150', '3');

    expect(read(row, 'rtl')).toBe('3 150 450');
    expect(runs(row, 'rtl')).toEqual(['ltr[3]', 'ltr[150]', 'ltr[450]']);
  });

  it('leaves punctuation at the edge of a Latin stretch with the Arabic', () => {
    // Printed: نهاية ) SKU-1 ( كود
    const line = onPage('نهاية', ')', 'SKU-1', '(', 'كود');

    expect(runs(line, 'rtl')).toEqual([
      'rtl[كود (]',
      'ltr[SKU-1]',
      'rtl[) نهاية]',
    ]);
  });

  it('keeps punctuation that sits inside a Latin stretch', () => {
    // Printed: نهاية SKU - 4471 كود
    expect(runs(onPage('نهاية', 'SKU', '-', '4471', 'كود'), 'rtl')).toEqual([
      'rtl[كود]',
      'ltr[SKU - 4471]',
      'rtl[نهاية]',
    ]);
  });
});

describe('orderTokens in a left-to-right line', () => {
  it('reads a stretch of Arabic words right to left, in place', () => {
    // Printed: Invoice رقم فاتورة total
    const line = onPage('Invoice', 'رقم', 'فاتورة', 'total');

    expect(read(line, 'ltr')).toBe('Invoice فاتورة رقم total');
    expect(runs(line, 'ltr')).toEqual([
      'ltr[Invoice]',
      'rtl[فاتورة رقم]',
      'ltr[total]',
    ]);
  });

  it('does not pull a neighbouring number into the Arabic stretch', () => {
    // Printed: Item كتاب 3 pcs
    expect(runs(onPage('Item', 'كتاب', '3', 'pcs'), 'ltr')).toEqual([
      'ltr[Item]',
      'rtl[كتاب]',
      'ltr[3 pcs]',
    ]);
  });
});

/**
 * The reference check. Each line below is written in reading order. The
 * Unicode bidi algorithm (bidi-js, an independent implementation) says where
 * each word lands on the page; orderTokens is then given only those positions
 * and must recover the original.
 *
 * Deliberately absent: a number between a Latin word and an Arabic one with no
 * Latin before it. The bidi algorithm maps two different reading orders to the
 * same page there, so no inverse exists; reconstruction picks the one a reader
 * would, and marks runs explicitly so display does not depend on it.
 */
describe('orderTokens against the Unicode bidi algorithm', () => {
  // The package ships CommonJS types over an ES module build; reach the
  // factory through the namespace so both the compiler and the runner agree.
  const bidi = (bidiModule as unknown as { default: () => Bidi }).default();

  function printedPositions(logical: string, base: Direction) {
    const levels = bidi.getEmbeddingLevels(logical, base);
    const visualOf = new Map<number, number>();
    bidi
      .getReorderedIndices(logical, levels)
      .forEach((logicalIndex, visualIndex) =>
        visualOf.set(logicalIndex, visualIndex),
      );

    const placed: Placed<string>[] = [];
    let offset = 0;
    for (const word of logical.split(' ')) {
      const positions = [...word].map((_, i) => visualOf.get(offset + i) ?? 0);
      placed.push({
        item: word,
        x: positions.reduce((a, b) => a + b, 0) / positions.length,
        tokenClass: classifyToken(word),
      });
      offset += word.length + 1;
    }
    return placed;
  }

  it.each([
    ['rtl', 'النقطة التي تغيّر المعنى'],
    ['rtl', 'شركة Nile Tech للتجارة والتوزيع'],
    ['rtl', 'فاتورة رقم INV 2041 بتاريخ اليوم'],
    ['rtl', 'كود SKU 4471 B نهاية السطر'],
    ['rtl', 'المبلغ 1250 جنيه فقط'],
    ['rtl', 'من 10 إلى 20 قطعة'],
    ['rtl', 'الكمية ١٢ والسعر ٤٥٠ جنيه'],
    ['rtl', 'كتاب Clean Code للمؤلف Robert Martin مترجم'],
    ['ltr', 'The word كتاب means book'],
    ['ltr', 'Invoice فاتورة رقم total due'],
    ['ltr', 'Supplier شركة النيل للتجارة Cairo Egypt'],
  ] as const)('%s: %s', (base, logical) => {
    const recovered = orderTokens(
      scrambled(printedPositions(logical, base)),
      base,
    );

    expect(recovered.map((token) => token.item).join(' ')).toBe(logical);
  });
});

describe('splitMixedToken', () => {
  it('separates an Arabic label from the identifier glued to it', () => {
    expect(splitMixedToken('رقم:INV-2041')).toEqual([
      { text: 'رقم:', direction: 'rtl' },
      { text: 'INV-2041', direction: 'ltr' },
    ]);
  });

  it('separates a prefix from a number, leaving the percent with the Arabic', () => {
    expect(splitMixedToken('بنسبة50%')).toEqual([
      { text: 'بنسبة', direction: 'rtl' },
      { text: '50', direction: 'ltr' },
      { text: '%', direction: 'rtl' },
    ]);
  });

  it('keeps diacritics with the Arabic letters they sit on', () => {
    expect(splitMixedToken('كِتَاب2')).toEqual([
      { text: 'كِتَاب', direction: 'rtl' },
      { text: '2', direction: 'ltr' },
    ]);
  });

  it('returns a single piece for a word in one script', () => {
    expect(splitMixedToken('نقطة')).toEqual([
      { text: 'نقطة', direction: 'rtl' },
    ]);
  });
});
