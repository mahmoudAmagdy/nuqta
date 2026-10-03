/**
 * The internal OCR shape. Every provider maps its own payload into this, and
 * nothing downstream of the broker ever sees a provider-specific structure.
 *
 * All geometry is in pixels of the page image that was sent to the provider,
 * origin top-left, x to the right and y down.
 */

export interface Point {
  x: number;
  y: number;
}

/** Axis-aligned box. Cheap to draw and to intersect. */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Four corners, clockwise from the top-left of the text as it reads. Kept
 * alongside the box because skewed scans produce quads that an axis-aligned
 * box overstates.
 */
export type Quad = [Point, Point, Point, Point];

export interface OcrToken {
  text: string;
  /** 0..1. Providers that report 0..100 are rescaled by their mapper. */
  confidence: number;
  box: BoundingBox;
  polygon: Quad;
}

export interface OcrLine {
  text: string;
  confidence: number;
  box: BoundingBox;
  polygon: Quad;
  tokens: OcrToken[];
}

export interface OcrPage {
  /** Zero-based position in the uploaded document. */
  index: number;
  width: number;
  height: number;
  /** Text rotation the provider detected, in degrees clockwise. 0 if unknown. */
  angle: number;
  lines: OcrLine[];
}

/**
 * How a provider orders the tokens of a right-to-left line.
 *  - `logical`: reading order, so the rightmost Arabic word comes first.
 *  - `visual`:  left-to-right as printed, so an Arabic line arrives reversed.
 *
 * Reconstruction normalises both to logical order; this only records what the
 * provider claims so the claim can be checked against geometry.
 */
export type TextOrder = 'logical' | 'visual';

export interface OcrDocument {
  provider: string;
  textOrder: TextOrder;
  pages: OcrPage[];
}

/** One page of the normalised working image set produced by intake. */
export interface PageImage {
  index: number;
  data: Buffer;
  mimeType: 'image/png';
  width: number;
  height: number;
}
