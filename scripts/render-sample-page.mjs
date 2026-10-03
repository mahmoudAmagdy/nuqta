/**
 * Renders the synthetic Arabic text page used to smoke-test a provider, and
 * writes its ground truth next to it.
 *
 *   node scripts/render-sample-page.mjs
 *
 * The text is written for this repository, so the sample carries no licence
 * or privacy question. It is deliberately awkward for OCR: letters that differ
 * only by their dots, both numeral systems, and Latin runs inside Arabic lines.
 *
 * Shaping and bidi are done by Pango through sharp. The font is whatever the
 * machine resolves for FONT, so the committed PNG is the reference, not a
 * byte-for-byte reproducible build output.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const FONT = 'Arial';
const PAGE_WIDTH = 1654; // A4 at 200 dpi
const MARGIN = 150;
const OUT_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../samples/text',
);

const title = 'النقطة التي تغيّر المعنى';
const paragraphs = [
  'في الكتابة العربية تفصل نقطة واحدة بين حرف وآخر: الباء والتاء والثاء تتشارك الرسم نفسه وتختلف في عدد النقاط ومواضعها. لذلك يخطئ القارئ الآلي حين تضيع نقطة في مسح رديء، فتصبح «بيت» «بنت» أو «تبت».',
  'تتصل الحروف بعضها ببعض ويتغيّر شكل الحرف بحسب موضعه في الكلمة، وتُكتب الأرقام بصيغتين: ١٢٣٤٥ و 67890. وقد يرد في السطر نفسه نص لاتيني مثل SKU-4471-B أو تاريخ مثل 2026-10-03.',
  'هذه الصفحة مكتوبة خصيصاً لهذا المشروع، فلا تحمل بيانات شخصية ولا حقوق نشر.',
];

const escape = (text) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

async function renderBlock(text, sizePt) {
  return sharp({
    text: {
      text: `<span foreground="black" size="${sizePt}pt">${escape(text)}</span>`,
      font: FONT,
      width: PAGE_WIDTH - MARGIN * 2,
      dpi: 200,
      rgba: true,
      // Pango swaps left and right for right-to-left paragraphs, so "left"
      // here means "aligned to the start of the line", i.e. the right edge.
      align: 'left',
      spacing: 18,
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
}

const blocks = [
  { ...(await renderBlock(title, 26)), gapAfter: 90 },
  ...(await Promise.all(paragraphs.map((p) => renderBlock(p, 15)))).map(
    (block) => ({ ...block, gapAfter: 60 }),
  ),
];

let top = MARGIN;
const layers = blocks.map(({ data, info, gapAfter }) => {
  const layer = { input: data, top, left: PAGE_WIDTH - MARGIN - info.width };
  top += info.height + gapAfter;
  return layer;
});

await mkdir(OUT_DIR, { recursive: true });
await sharp({
  create: {
    width: PAGE_WIDTH,
    height: top - blocks.at(-1).gapAfter + MARGIN,
    channels: 3,
    background: 'white',
  },
})
  .composite(layers)
  .png({ compressionLevel: 9 })
  .toFile(resolve(OUT_DIR, 'nuqta-page-01.png'));

await writeFile(
  resolve(OUT_DIR, 'nuqta-page-01.json'),
  JSON.stringify(
    {
      source: 'synthetic',
      licence: 'MIT (written for this repository)',
      generator: 'scripts/render-sample-page.mjs',
      font: FONT,
      title,
      paragraphs,
      text: [title, ...paragraphs].join('\n'),
    },
    null,
    2,
  ) + '\n',
  'utf8',
);

console.log(`wrote ${resolve(OUT_DIR, 'nuqta-page-01.png')}`);
