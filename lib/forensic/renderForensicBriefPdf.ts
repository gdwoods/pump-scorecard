// lib/forensic/renderForensicBriefPdf.ts

import { PDFDocument, PDFPage, rgb, StandardFonts, type PDFFont, type RGB } from 'pdf-lib';
import type { AiThesisResult } from '@/lib/ai/types';
import { buildBriefSections, formatBriefPlainText, type BriefSectionKind } from './formatBriefForExport';
import { sanitizePdfText } from './sanitizePdfText';
import type { ForensicFactPack } from './types';

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BODY_SIZE = 10;
const BODY_LH = 13;
const FOOTER_H = 36;

const COLORS = {
  brand: rgb(0.09, 0.18, 0.42),
  brandLight: rgb(0.93, 0.95, 0.99),
  white: rgb(1, 1, 1),
  text: rgb(0.12, 0.12, 0.14),
  muted: rgb(0.45, 0.45, 0.48),
  rule: rgb(0.82, 0.84, 0.88),
  rowAlt: rgb(0.96, 0.97, 0.99),
  alertBg: rgb(1, 0.94, 0.94),
  alertBorder: rgb(0.85, 0.25, 0.25),
  conflictBg: rgb(1, 0.96, 0.91),
  conflictBorder: rgb(0.9, 0.45, 0.15),
  verify: rgb(0.72, 0.45, 0.05),
  conflict: rgb(0.85, 0.35, 0.1),
  opinion: rgb(0.42, 0.28, 0.65),
  high: rgb(0.75, 0.12, 0.12),
  moderate: rgb(0.75, 0.45, 0.05),
  low: rgb(0.4, 0.4, 0.42),
};

type TagStyle = { label: string; color: RGB; width: number };

function parseLeadingTag(line: string): { tag: TagStyle | null; body: string } {
  const m = line.match(/^\[([A-Z]+)\]\s*(.*)$/);
  if (!m) return { tag: null, body: line };
  const key = m[1];
  const body = m[2];
  const styles: Record<string, TagStyle> = {
    VERIFY: { label: 'VERIFY', color: COLORS.verify, width: 44 },
    CONFLICT: { label: 'CONFLICT', color: COLORS.conflict, width: 52 },
    OPINION: { label: 'OPINION', color: COLORS.opinion, width: 48 },
    HIGH: { label: 'HIGH', color: COLORS.high, width: 32 },
    MODERATE: { label: 'MOD', color: COLORS.moderate, width: 28 },
    LOW: { label: 'LOW', color: COLORS.low, width: 26 },
    STALE: { label: 'STALE', color: COLORS.low, width: 34 },
  };
  return { tag: styles[key] ?? null, body };
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const safe = sanitizePdfText(text);
  if (!safe) return [];
  const words = safe.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

class BriefPdfLayout {
  private pdfDoc: PDFDocument;
  private font: PDFFont;
  private bold: PDFFont;
  private page: PDFPage;
  private y: number;
  private pageIndex = 0;

  constructor(pdfDoc: PDFDocument, font: PDFFont, bold: PDFFont) {
    this.pdfDoc = pdfDoc;
    this.font = font;
    this.bold = bold;
    this.page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    this.pageIndex = 1;
    this.y = PAGE_H - MARGIN;
  }

  private bottomLimit() {
    return MARGIN + FOOTER_H;
  }

  private newPage() {
    this.drawPageFooter();
    this.page = this.pdfDoc.addPage([PAGE_W, PAGE_H]);
    this.pageIndex += 1;
    this.y = PAGE_H - MARGIN;
  }

  private ensureSpace(needed: number) {
    if (this.y - needed < this.bottomLimit()) this.newPage();
  }

  private drawPageFooter() {
    const footerY = 28;
    this.page.drawLine({
      start: { x: MARGIN, y: footerY + 10 },
      end: { x: PAGE_W - MARGIN, y: footerY + 10 },
      thickness: 0.5,
      color: COLORS.rule,
    });
    this.page.drawText(sanitizePdfText('Short Check Forensic Brief - research only, not trade authorization'), {
      x: MARGIN,
      y: footerY,
      size: 7,
      font: this.font,
      color: COLORS.muted,
    });
    const pageLabel = `Page ${this.pageIndex}`;
    const labelW = this.font.widthOfTextAtSize(pageLabel, 7);
    this.page.drawText(pageLabel, {
      x: PAGE_W - MARGIN - labelW,
      y: footerY,
      size: 7,
      font: this.font,
      color: COLORS.muted,
    });
  }

  drawTitleBlock(ticker: string, meta: string[]) {
    const headerH = 52;
    this.ensureSpace(headerH + 40);
    const top = this.y;
    this.page.drawRectangle({
      x: MARGIN,
      y: top - headerH,
      width: CONTENT_W,
      height: headerH,
      color: COLORS.brand,
    });
    this.page.drawText(sanitizePdfText(`FORENSIC BRIEF`), {
      x: MARGIN + 14,
      y: top - 22,
      size: 9,
      font: this.font,
      color: rgb(0.75, 0.82, 0.95),
    });
    this.page.drawText(sanitizePdfText(ticker), {
      x: MARGIN + 14,
      y: top - 40,
      size: 20,
      font: this.bold,
      color: COLORS.white,
    });
    const dateStr = new Date().toLocaleDateString();
    const dateW = this.font.widthOfTextAtSize(dateStr, 9);
    this.page.drawText(dateStr, {
      x: PAGE_W - MARGIN - 14 - dateW,
      y: top - 40,
      size: 9,
      font: this.font,
      color: rgb(0.85, 0.9, 1),
    });
    this.y = top - headerH - 14;

    for (const line of meta) {
      this.ensureSpace(BODY_LH);
      this.page.drawText(sanitizePdfText(line), {
        x: MARGIN,
        y: this.y,
        size: 8,
        font: this.font,
        color: COLORS.muted,
      });
      this.y -= BODY_LH;
    }
    this.y -= 8;
  }

  drawSectionHeader(title: string) {
    this.ensureSpace(28);
    this.y -= 10;
    const clean = sanitizePdfText(title.replace(/^\d+\.\s*/, ''));
    this.page.drawText(clean.toUpperCase(), {
      x: MARGIN,
      y: this.y,
      size: 9,
      font: this.bold,
      color: COLORS.brand,
    });
    this.y -= 6;
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_W - MARGIN, y: this.y },
      thickness: 1,
      color: COLORS.rule,
    });
    this.y -= 10;
  }

  private drawWrappedLines(
    lines: string[],
    size: number,
    opts: { indent?: number; color?: RGB; font?: PDFFont; lineHeight?: number } = {}
  ) {
    const indent = opts.indent ?? 0;
    const color = opts.color ?? COLORS.text;
    const f = opts.font ?? this.font;
    const lh = opts.lineHeight ?? BODY_LH;
    const maxW = CONTENT_W - indent;
    for (const raw of lines) {
      for (const line of wrapText(raw, f, size, maxW)) {
        this.ensureSpace(lh);
        this.page.drawText(line, { x: MARGIN + indent, y: this.y, size, font: f, color });
        this.y -= lh;
      }
    }
  }

  private drawTaggedLine(line: string, bullet = false) {
    const { tag, body } = parseLeadingTag(line);
    const indent = bullet ? 12 : 0;
    const tagW = tag ? tag.width + 6 : 0;
    const textIndent = indent + tagW;

    if (tag) {
      this.ensureSpace(BODY_LH + 2);
      const tagY = this.y - 1;
      if (bullet) {
        this.page.drawText('-', {
          x: MARGIN + 4,
          y: tagY,
          size: BODY_SIZE,
          font: this.font,
          color: COLORS.muted,
        });
      }
      this.page.drawRectangle({
        x: MARGIN + indent,
        y: tagY - 2,
        width: tag.width,
        height: 12,
        color: rgb(
          Math.min(1, tag.color.red + 0.82),
          Math.min(1, tag.color.green + 0.82),
          Math.min(1, tag.color.blue + 0.82)
        ),
        borderColor: tag.color,
        borderWidth: 0.5,
      });
      this.page.drawText(tag.label, {
        x: MARGIN + indent + 3,
        y: tagY,
        size: 6.5,
        font: this.bold,
        color: tag.color,
      });
    } else if (bullet) {
      this.ensureSpace(BODY_LH);
      this.page.drawText('-', {
        x: MARGIN + 4,
        y: this.y,
        size: BODY_SIZE,
        font: this.font,
        color: COLORS.muted,
      });
    }

    this.drawWrappedLines([body || line], BODY_SIZE, { indent: textIndent });
    this.y -= 2;
  }

  drawSnapshotTable(lines: string[]) {
    const pairs = lines
      .map((l) => {
        const idx = l.indexOf(':');
        if (idx < 0) return null;
        return { label: l.slice(0, idx).trim(), value: l.slice(idx + 1).trim() };
      })
      .filter((p): p is { label: string; value: string } => Boolean(p));

    const colMid = MARGIN + CONTENT_W * 0.42;
    const rowH = 18;
    const tableH = pairs.length * rowH + 8;
    this.ensureSpace(tableH + 4);

    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - tableH,
      width: CONTENT_W,
      height: tableH,
      color: COLORS.brandLight,
      borderColor: COLORS.rule,
      borderWidth: 0.75,
    });

    let rowY = this.y - 14;
    pairs.forEach((pair, i) => {
      if (i % 2 === 1) {
        this.page.drawRectangle({
          x: MARGIN + 1,
          y: rowY - 6,
          width: CONTENT_W - 2,
          height: rowH,
          color: COLORS.rowAlt,
        });
      }
      this.page.drawText(sanitizePdfText(pair.label), {
        x: MARGIN + 10,
        y: rowY,
        size: 9,
        font: this.font,
        color: COLORS.muted,
      });
      this.page.drawText(sanitizePdfText(pair.value), {
        x: colMid,
        y: rowY,
        size: 9,
        font: this.bold,
        color: COLORS.text,
      });
      rowY -= rowH;
    });
    this.y -= tableH + 6;
  }

  drawAlertBox(lines: string[]) {
    const wrapped: string[] = [];
    for (const line of lines) {
      wrapped.push(...wrapText(line, this.font, BODY_SIZE, CONTENT_W - 24));
    }
    const boxH = wrapped.length * BODY_LH + 20;
    this.ensureSpace(boxH + 4);

    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - boxH,
      width: CONTENT_W,
      height: boxH,
      color: COLORS.alertBg,
      borderColor: COLORS.alertBorder,
      borderWidth: 1,
    });
    let innerY = this.y - 14;
    for (const line of wrapped) {
      this.page.drawText(line, {
        x: MARGIN + 12,
        y: innerY,
        size: BODY_SIZE,
        font: this.bold,
        color: COLORS.alertBorder,
      });
      innerY -= BODY_LH;
    }
    this.y -= boxH + 8;
  }

  drawConflictBox(lines: string[]) {
    const wrapped: string[] = [];
    for (const line of lines) {
      wrapped.push(...wrapText(line, this.font, BODY_SIZE, CONTENT_W - 24));
    }
    const boxH = wrapped.length * BODY_LH + 16;
    this.ensureSpace(boxH + 4);

    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - boxH,
      width: CONTENT_W,
      height: boxH,
      color: COLORS.conflictBg,
      borderColor: COLORS.conflictBorder,
      borderWidth: 0.75,
    });
    let innerY = this.y - 12;
    for (const line of wrapped) {
      this.page.drawText(line, {
        x: MARGIN + 12,
        y: innerY,
        size: BODY_SIZE,
        font: this.font,
        color: COLORS.text,
      });
      innerY -= BODY_LH;
    }
    this.y -= boxH + 8;
  }

  drawScorecardGrid(lines: string[]) {
    const rowH = 20;
    const barMaxW = CONTENT_W * 0.35;
    const tableH = lines.length * rowH + 10;
    this.ensureSpace(tableH + 4);

    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - tableH,
      width: CONTENT_W,
      height: tableH,
      color: COLORS.brandLight,
      borderColor: COLORS.rule,
      borderWidth: 0.75,
    });

    let rowY = this.y - 14;
    for (const raw of lines) {
      const idx = raw.indexOf(':');
      const label = idx >= 0 ? raw.slice(0, idx).trim() : raw;
      const value = idx >= 0 ? raw.slice(idx + 1).trim() : '';
      const scoreMatch = value.match(/^(\d+)\/10/);
      const score = scoreMatch ? Number(scoreMatch[1]) : null;

      this.page.drawText(sanitizePdfText(label), {
        x: MARGIN + 10,
        y: rowY,
        size: 8.5,
        font: this.font,
        color: COLORS.muted,
      });

      const valueX = MARGIN + CONTENT_W * 0.48;
      this.page.drawText(sanitizePdfText(value), {
        x: valueX,
        y: rowY,
        size: 8.5,
        font: this.bold,
        color: COLORS.text,
      });

      if (score != null) {
        const barW = (score / 10) * barMaxW;
        const barColor =
          score >= 8 ? COLORS.high : score >= 6 ? COLORS.moderate : COLORS.low;
        this.page.drawRectangle({
          x: valueX,
          y: rowY - 8,
          width: barMaxW,
          height: 4,
          color: COLORS.rule,
        });
        this.page.drawRectangle({
          x: valueX,
          y: rowY - 8,
          width: barW,
          height: 4,
          color: barColor,
        });
      }
      rowY -= rowH;
    }
    this.y -= tableH + 6;
  }

  drawSection(kind: BriefSectionKind | undefined, lines: string[]) {
    if (!lines.length) return;
    switch (kind) {
      case 'scorecard':
        this.drawScorecardGrid(lines);
        break;
      case 'snapshot':
        this.drawSnapshotTable(lines);
        break;
      case 'alerts':
        this.drawAlertBox(lines);
        break;
      case 'conflicts':
        this.drawConflictBox(lines);
        break;
      case 'prose':
        for (const line of lines) this.drawTaggedLine(line, false);
        this.y -= 4;
        break;
      case 'catalysts':
      case 'forward-dates':
      case 'bullets':
      default:
        for (const line of lines) this.drawTaggedLine(line, true);
        this.y -= 4;
        break;
    }
  }

  finish() {
    this.drawPageFooter();
  }
}

export async function renderForensicBriefPdf(
  factPack: ForensicFactPack,
  thesis?: AiThesisResult | null
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const layout = new BriefPdfLayout(pdfDoc, font, boldFont);

  const meta: string[] = [
    `As of ${new Date(factPack.asOf).toLocaleString()}`,
    `Fact pack ${factPack.version}`,
  ];
  if (thesis?.reportVersion) meta.push(`Report ${thesis.reportVersion}`);
  if (thesis?.generatedAt) meta.push(`Generated ${new Date(thesis.generatedAt).toLocaleString()}`);
  if (thesis?.model) meta.push(`Inference via Groq (${thesis.model})`);

  layout.drawTitleBlock(factPack.ticker, meta);

  for (const section of buildBriefSections(factPack, thesis)) {
    layout.drawSectionHeader(section.title);
    layout.drawSection(section.kind, section.lines);
  }

  layout.finish();
  return pdfDoc.save();
}

export { formatBriefPlainText, buildBriefSections };
