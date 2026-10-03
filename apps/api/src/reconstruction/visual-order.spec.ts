import { foldPresentationForms } from './unicode.js';
import {
  orderFromShapes,
  presentationForm,
  visualToLogical,
} from './visual-order.js';

const cp = (...codes: number[]) => String.fromCodePoint(...codes);
const reversed = (text: string) => [...text].reverse().join('');
const FATHA = cp(0x064e);

// "العربية", one code point per glyph, in reading order:
// alef isolated, lam initial, ain medial, reh final, beh initial, yeh medial,
// teh marbuta final.
const AL_ARABIYYA = cp(0xfe8d, 0xfedf, 0xfecc, 0xfeae, 0xfe91, 0xfef4, 0xfe94);

// "سلام": seen initial, lam-alef ligature final, meem isolated.
const SALAM = cp(0xfeb3, 0xfefc, 0xfee1);

describe('presentationForm', () => {
  it('knows which positional shape a Forms-B code point is', () => {
    expect(presentationForm(cp(0xfe8d))).toBe('isolated'); // alef
    expect(presentationForm(cp(0xfe8e))).toBe('final');
    expect(presentationForm(cp(0xfe91))).toBe('initial'); // beh
    expect(presentationForm(cp(0xfe92))).toBe('medial');
    expect(presentationForm(cp(0xfefc))).toBe('final'); // lam-alef
  });

  it('covers the block exactly, with no gaps and no overrun', () => {
    for (let code = 0xfe80; code <= 0xfefc; code++) {
      expect(presentationForm(cp(code)), code.toString(16)).not.toBeNull();
    }
    expect(presentationForm(cp(0xfe7f))).toBeNull();
    expect(presentationForm(cp(0xfefd))).toBeNull();
  });

  it('has nothing to say about ordinary letters', () => {
    expect(presentationForm('ع')).toBeNull();
    expect(presentationForm('A')).toBeNull();
  });
});

describe('orderFromShapes', () => {
  it('recognises shaped text in reading order', () => {
    expect(orderFromShapes(AL_ARABIYYA)).toBe('logical');
  });

  it('recognises the same text running backwards', () => {
    expect(orderFromShapes(reversed(AL_ARABIYYA))).toBe('visual');
  });

  it('is not fooled by a word made of several joined groups', () => {
    // "فاتورة" breaks after alef, waw and reh. Reversed, the pair
    // (teh initial, alef final) looks like reading order taken on its own.
    const fatura = cp(0xfed3, 0xfe8e, 0xfe97, 0xfeee, 0xfead, 0xfe93);

    expect(orderFromShapes(fatura)).toBe('logical');
    expect(orderFromShapes(reversed(fatura))).toBe('visual');
  });

  it('abstains when there are no shapes to read', () => {
    expect(orderFromShapes('العربية')).toBeNull();
    expect(orderFromShapes('SKU-4471')).toBeNull();
    expect(orderFromShapes(cp(0xfe8d))).toBeNull();
  });

  it('ignores marks sitting between two joined letters', () => {
    const behFathaYeh = cp(0xfe91) + FATHA + cp(0xfef2); // initial, mark, final

    expect(orderFromShapes(behFathaYeh)).toBe('logical');
  });
});

describe('visualToLogical', () => {
  it('reverses a visually ordered Arabic word', () => {
    expect(foldPresentationForms(visualToLogical(reversed(AL_ARABIYYA)))).toBe(
      'العربية',
    );
  });

  it('must run before ligatures are opened, or it produces another word', () => {
    const visual = reversed(SALAM);

    // Right: reverse the glyphs, then open the ligature. "Peace".
    expect(foldPresentationForms(visualToLogical(visual))).toBe('سلام');
    // Wrong: open the ligature first, then reverse. "Salem", a man's name.
    expect(visualToLogical(foldPresentationForms(visual))).toBe('سالم');
  });

  it('keeps a number inside the token left to right', () => {
    // "رقم2041" as printed, left to right: the digits, then the word reversed.
    expect(visualToLogical('2041مقر')).toBe('رقم2041');
  });

  it('keeps an identifier with its separators intact', () => {
    expect(visualToLogical('INV-2041:مقر')).toBe('رقم:INV-2041');
  });

  it('moves a letter and its marks together', () => {
    // Glyph order, each mark still after its own letter.
    const visual = 'م' + 'ل' + FATHA + 'ق' + FATHA;

    expect(visualToLogical(visual)).toBe('ق' + FATHA + 'ل' + FATHA + 'م');
  });

  it('repairs a code-point reversal, where every mark precedes its letter', () => {
    const logical = 'ق' + FATHA + 'ل' + FATHA + 'م' + FATHA;

    expect(visualToLogical(reversed(logical))).toBe(logical);
  });
});
