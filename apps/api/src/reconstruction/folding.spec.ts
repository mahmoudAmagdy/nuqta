import { toSearchForm } from './folding.js';

const cp = (...codes: number[]) => String.fromCodePoint(...codes);
const FARSI_YEH = cp(0x06cc);
const KEHEH = cp(0x06a9);
const ALEF_WASLA = cp(0x0671);

describe('toSearchForm', () => {
  it.each([
    ['hamza above', 'أحمد', 'احمد'],
    ['hamza below', 'إسلام', 'اسلام'],
    ['madda', 'آخر', 'اخر'],
    ['dotless final yeh', 'مستشفى', 'مستشفي'],
    ['teh marbuta', 'مدرسة', 'مدرسه'],
    ['tashkeel', 'مُحَمَّد', 'محمد'],
    ['tatweel', 'محـــمد', 'محمد'],
  ])('matches two spellings that differ only by %s', (_, a, b) => {
    expect(toSearchForm(a)).toBe(toSearchForm(b));
  });

  it('folds the alef wasla with the other alef carriers', () => {
    expect(toSearchForm(ALEF_WASLA + 'سم')).toBe('اسم');
  });

  it('folds the Farsi letter shapes engines emit for Arabic ones', () => {
    expect(toSearchForm('عل' + FARSI_YEH)).toBe('علي');
    expect(toSearchForm(KEHEH + 'تاب')).toBe('كتاب');
  });

  it('makes a number match in either digit set', () => {
    expect(toSearchForm('١٢٥٠')).toBe(toSearchForm('1250'));
  });

  it('lower-cases Latin so identifiers match regardless of case', () => {
    expect(toSearchForm('SKU-4471-B')).toBe('sku-4471-b');
  });

  it('keeps hamza on waw and yeh, which do change the word', () => {
    expect(toSearchForm('مؤسسة')).toBe('مؤسسه');
    expect(toSearchForm('رئيس')).toBe('رئيس');
  });

  it('treats a decomposed hamza the same as a composed one', () => {
    expect(toSearchForm(cp(0x0627, 0x0654) + 'حمد')).toBe('احمد');
  });

  it('folds a whole line the way the rules say', () => {
    expect(toSearchForm('النقطة التى تغيّر المعنى')).toBe(
      'النقطه التي تغير المعني',
    );
  });
});
