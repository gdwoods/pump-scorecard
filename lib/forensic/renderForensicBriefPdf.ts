// lib/forensic/renderForensicBriefPdf.ts

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { AiThesisResult } from '@/lib/ai/types';
import { buildBriefSections, formatBriefPlainText } from './formatBriefForExport';
import type { ForensicFactPack } from './types';

const PAGE_SIZE: [number, number] = [612, 792];
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_SIZE[0] - MARGIN * 2;
const LINE_HEIGHT = 14;
const SECTION_GAP = 10;

export async function renderForensicBriefPdf(
  factPack: ForensicFactPack,
  thesis?: AiThesisResult | null
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page = pdfDoc.addPage(PAGE_SIZE);
  let y = PAGE_SIZE[1] - MARGIN;

  const ensureSpace = (needed = LINE_HEIGHT) => {
    if (y - needed < MARGIN + 40) {
      page = pdfDoc.addPage(PAGE_SIZE);
      y = PAGE_SIZE[1] - MARGIN;
    }
  };

  const drawLine = (text: string, size: number, isBold = false, indent = 0) => {
    if (!text) return;
    const currentFont = isBold ? boldFont : font;
    const words = text.split(' ');
    let line = '';
    const x = MARGIN + indent;

    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (currentFont.widthOfTextAtSize(test, size) > CONTENT_WIDTH - indent && line) {
        ensureSpace();
        page.drawText(line, { x, y, size, font: currentFont });
        y -= LINE_HEIGHT;
        line = word;
      } else {
        line = test;
      }
    }
    if (line) {
      ensureSpace();
      page.drawText(line, { x, y, size, font: currentFont });
      y -= LINE_HEIGHT;
    }
  };

  const drawSectionHeader = (title: string) => {
    ensureSpace(LINE_HEIGHT * 2);
    y -= SECTION_GAP;
    drawLine(title, 12, true);
    y -= 4;
  };

  // Title block
  drawLine(`Forensic Brief — ${factPack.ticker}`, 16, true);
  drawLine(`As of: ${new Date(factPack.asOf).toLocaleString()}`, 9);
  drawLine(`Fact pack: ${factPack.version}`, 9);
  if (thesis?.reportVersion) drawLine(`Report: ${thesis.reportVersion}`, 9);
  if (thesis?.generatedAt) {
    drawLine(`Generated: ${new Date(thesis.generatedAt).toLocaleString()}`, 9);
  }
  if (thesis?.model) drawLine(`Model: ${thesis.model}`, 9);
  y -= SECTION_GAP;

  for (const section of buildBriefSections(factPack, thesis)) {
    drawSectionHeader(section.title);
    for (const line of section.lines) {
      drawLine(line, 10);
    }
  }

  ensureSpace(LINE_HEIGHT * 3);
  y -= SECTION_GAP;
  page.drawText(
    'DISCLAIMER: Research synthesis only — not trade authorization. Framework 3.0 walk-away flags bind.',
    {
      x: MARGIN,
      y,
      size: 8,
      font,
      color: rgb(0.4, 0.4, 0.4),
      maxWidth: CONTENT_WIDTH,
      lineHeight: 10,
    }
  );

  return pdfDoc.save();
}

/** Re-export for tests — ensures PDF and plain text share the same section builder. */
export { formatBriefPlainText, buildBriefSections };
