// app/api/export-pdf/route.ts
import { NextRequest, NextResponse } from "next/server";
import yahooFinance from "yahoo-finance2";
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ticker } = body;

    if (!ticker) {
      return NextResponse.json({ error: "Ticker required" }, { status: 400 });
    }

    const upperTicker = ticker.toUpperCase();

    // ---------- Yahoo Finance ----------
    let quote: any = {};
    let history: any[] = [];
    try {
      quote = await yahooFinance.quote(upperTicker);
      const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 180;
      const chart = await yahooFinance.chart(upperTicker, {
        period1: new Date(Date.now() - SIX_MONTHS_MS),
        period2: new Date(),
        interval: "1d",
      });
      history =
        chart.quotes?.map((q: any) => ({
          date: q.date?.toISOString().split("T")[0] || "",
          close: q.close,
          volume: q.volume,
        })) || [];
    } catch (err) {
      console.error("⚠️ Yahoo fetch failed:", err);
    }

    // ---------- Scores ----------
    const latest = history.at(-1) || {};
    const prev = history.at(-2) || latest;
    const avgVol =
      history.reduce((s, q) => s + (q.volume || 0), 0) /
      (history.length || 1) || 0;
    const sudden_volume_spike =
      !!latest.volume && avgVol > 0 && latest.volume > avgVol * 3;
    const sudden_price_spike =
      latest.close > (prev.close || latest.close) * 1.25;

    let weightedScore = 0;
    if (sudden_volume_spike) weightedScore += 20;
    if (sudden_price_spike) weightedScore += 20;

    let summaryVerdict = "Low risk";
    if (weightedScore >= 70) summaryVerdict = "High risk";
    else if (weightedScore >= 40) summaryVerdict = "Moderate risk";

    // ---------- Generate PDF ----------
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let y = height - 50;

    page.drawText(`Pump Scorecard: ${upperTicker}`, {
      x: 50,
      y,
      size: 20,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    y -= 30;

    page.drawText(`Date: ${new Date().toLocaleDateString()}`, {
      x: 50,
      y,
      size: 12,
      font,
    });
    y -= 40;

    page.drawText(`Risk Verdict: ${summaryVerdict}`, {
      x: 50,
      y,
      size: 14,
      font: boldFont,
      color: summaryVerdict === "High risk" ? rgb(0.8, 0, 0) : rgb(0, 0, 0),
    });
    y -= 25;

    page.drawText(`Risk Score: ${weightedScore}`, {
      x: 50,
      y,
      size: 12,
      font,
    });
    y -= 40;

    page.drawText(`Company: ${quote.longName || upperTicker}`, {
      x: 50,
      y,
      size: 12,
      font,
    });
    y -= 20;

    page.drawText(`Price: $${quote.regularMarketPrice || 'N/A'}`, {
      x: 50,
      y,
      size: 12,
      font,
    });
    y -= 20;

    const pdfBytes = await pdfDoc.save();

    return new NextResponse(pdfBytes as any, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${upperTicker}_scorecard.pdf"`,
      },
    });

  } catch (err: any) {
    console.error("❌ PDF generation error:", err);
    return NextResponse.json(
      { error: err.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
