// app/api/export-pdf/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export const runtime = "nodejs";

type ScanPayload = {
  ticker?: string;
  companyName?: string;
  lastPrice?: number | null;
  droppinessScore?: number;
  droppinessVerdict?: string;
  capitalPressure?: {
    score?: number;
    status?: string;
    summary?: string;
  };
  marketCap?: number | null;
  floatShares?: number | null;
};

function wrapText(text: string, maxLen: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxLen) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const ticker = String(body.ticker || body.scan?.ticker || "").toUpperCase();
    const scan: ScanPayload | undefined = body.scan;

    if (!ticker) {
      return NextResponse.json({ error: "Ticker required" }, { status: 400 });
    }

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    const { height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let y = height - 50;

    page.drawText(`Pump Scorecard: ${ticker}`, {
      x: 50,
      y,
      size: 20,
      font: boldFont,
    });
    y -= 28;

    page.drawText(`Generated: ${new Date().toLocaleDateString()}`, {
      x: 50,
      y,
      size: 11,
      font,
    });
    y -= 32;

    if (scan?.companyName) {
      page.drawText(scan.companyName, { x: 50, y, size: 12, font });
      y -= 18;
    }

    if (scan?.lastPrice != null) {
      page.drawText(`Price: $${scan.lastPrice.toFixed(2)}`, { x: 50, y, size: 12, font });
      y -= 24;
    }

    if (scan?.droppinessScore !== undefined) {
      page.drawText("Droppiness", { x: 50, y, size: 14, font: boldFont });
      y -= 18;
      page.drawText(`Score: ${scan.droppinessScore}`, { x: 50, y, size: 12, font });
      y -= 16;
      if (scan.droppinessVerdict) {
        for (const line of wrapText(scan.droppinessVerdict, 80)) {
          page.drawText(line, { x: 50, y, size: 10, font });
          y -= 14;
        }
        y -= 8;
      }
    }

    if (scan?.capitalPressure) {
      const cp = scan.capitalPressure;
      page.drawText("Capital Pressure", { x: 50, y, size: 14, font: boldFont });
      y -= 18;
      page.drawText(
        `Score: ${cp.score ?? "n/a"}/100 (${cp.status ?? "n/a"})`,
        { x: 50, y, size: 12, font }
      );
      y -= 16;
      if (cp.summary) {
        for (const line of wrapText(cp.summary, 80)) {
          page.drawText(line, { x: 50, y, size: 10, font });
          y -= 14;
        }
      }
      y -= 8;
    }

    if (scan?.marketCap || scan?.floatShares) {
      page.drawText("Fundamentals", { x: 50, y, size: 14, font: boldFont });
      y -= 18;
      if (scan.marketCap) {
        page.drawText(`Market cap: $${(scan.marketCap / 1e6).toFixed(1)}M`, {
          x: 50,
          y,
          size: 11,
          font,
        });
        y -= 14;
      }
      if (scan.floatShares) {
        page.drawText(`Float: ${(scan.floatShares / 1e6).toFixed(2)}M shares`, {
          x: 50,
          y,
          size: 11,
          font,
        });
        y -= 14;
      }
    }

    if (!scan) {
      page.drawText(
        "Re-scan this ticker from Pump Scorecard to include Droppiness and Capital Pressure in the export.",
        { x: 50, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) }
      );
    }

    const pdfBytes = await pdfDoc.save();

    return new NextResponse(pdfBytes as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${ticker}_scorecard.pdf"`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    console.error("PDF generation error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
