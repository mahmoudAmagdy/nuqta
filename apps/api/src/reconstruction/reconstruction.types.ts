import type { BoundingBox, Quad } from '../ocr/ocr.types.js';

export type Direction = 'rtl' | 'ltr';

/** What a token is made of, decided on its cleaned text. */
export type TokenKind = 'arabic' | 'latin' | 'number' | 'punctuation' | 'mixed';

export interface ReconstructedToken {
  /**
   * Display text: logical character order, presentation forms folded back to
   * base letters, control characters removed. Diacritics and the original
   * numeral system are kept.
   */
  text: string;
  /** Matching form: see `toSearchForm`. Never shown to a reader. */
  search: string;
  /** Exactly what the provider returned, for audit. */
  original: string;
  kind: TokenKind;
  confidence: number;
  box: BoundingBox;
  polygon: Quad;
}

/**
 * A stretch of a line that reads in one direction. Offsets index into the
 * line's `text` the way `String.prototype.slice` does (UTF-16 code units);
 * the gaps between runs are the spaces between tokens.
 *
 * A renderer should isolate each run (`<bdi dir>`), not leave direction to the
 * implicit bidi algorithm, which reorders digit groups and Latin words inside
 * Arabic in ways the printed page did not.
 */
export interface DirectionalRun {
  start: number;
  end: number;
  direction: Direction;
}

export interface ReconstructedLine {
  /** Tokens in reading order, joined by single spaces. */
  text: string;
  search: string;
  /** Base direction of the line. */
  direction: Direction;
  runs: DirectionalRun[];
  /** In reading order: the first token is the first word a reader reads. */
  tokens: ReconstructedToken[];
  confidence: number;
  box: BoundingBox;
  polygon: Quad;
}

export interface ReconstructedPage {
  index: number;
  width: number;
  height: number;
  angle: number;
  direction: Direction;
  lines: ReconstructedLine[];
}

/** The only thing an adapter is ever given. */
export interface ReconstructedDocument {
  provider: string;
  pages: ReconstructedPage[];
}
