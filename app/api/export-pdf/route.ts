import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// Shared scoring function
function computeScore(result: any, manualFlags: any) {
  const baseCriteria = [
    result.sudden_volume_spike,
    result.sudden_price_spike,
    result.valuation_fundamentals_mismatch,
    result.reverse_split,
    result.dividend_announced,
    result.promoted_stock,
    result.dilution_or_offering,
    result.riskyCountry,
    result.fraudEvidence,
  ];
  const manualCriteria = [
    manualFlags.impersonated_advisors,
    manualFlags.guaranteed_returns,
    manualFlags.regulatory_alerts,
  ];
  const trueCount = [...baseCriteria, ...manualCriteria].filter(Boolean).length;
  return Math.round((trueCount / 12) * 100);
}

export async function POST(req: Request) {
  try {
    const { ticker, result, manualFlags } = await req.json();

    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage([600, 800]); // <-- must be let
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const score = computeScore(result, manualFlags);

    let y = 760;
    const lineHeight = 20;

    // Header
    page.drawText(`Pump Scorecard — ${ticker}`, {
      x: 50,
      y,
      size: 18,
      font,
      color: rgb(0, 0, 0),
    });
    y -= lineHeight * 2;

    // Score & Verdict
    page.drawText(`Final Verdict: ${result.summaryVerdict}`, { x: 50, y, size: 14, font });
    y -= lineHeight;
    page.drawText(`Score: ${score}%`, { x: 50, y, size: 14, font });
    y -= lineHeight;
    page.drawText(result.summaryText, { x: 50, y, size: 12, font, maxWidth: 500 });
    y -= lineHeight * 2;

    // Criteria list (auto + manual)
    const criteria = [
      { label: "Sudden volume spike", value: result.sudden_volume_spike },
      { label: "Sudden price spike", value: result.sudden_price_spike },
      { label: "Valuation fundamentals mismatch", value: result.valuation_fundamentals_mismatch },
      { label: "Reverse split", value: result.reverse_split },
      { label: "Dividend announced", value: result.dividend_announced },
      { label: "Promoted stock", value: result.promoted_stock },
      { label: "Dilution/offering filing", value: result.dilution_or_offering },
      { label: "Risky country (China/HK/Malaysia)", value: result.riskyCountry },
      { label: "Fraud evidence posted online", value: result.fraudEvidence },
      { label: "Impersonated advisors", value: manualFlags.impersonated_advisors },
      { label: "Guaranteed returns", value: manualFlags.guaranteed_returns },
      { label: "Regulatory alerts", value: manualFlags.regulatory_alerts },
    ];

    page.drawText("Criteria:", { x: 50, y, size: 14, font });
    y -= lineHeight;

    for (const c of criteria) {
      const box = c.value ? "[x]" : "[ ]";
      page.drawText(`${box} ${c.label}`, { x: 70, y, size: 12, font });
      y -= lineHeight;

      if (y < 50) {
        page = pdfDoc.addPage([600, 800]); // ✅ works now
        y = 760;
      }
    }

    const pdfBytes = await pdfDoc.save();

    return new NextResponse(pdfBytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${ticker}_scorecard.pdf"`,
      },
    });
  } catch (err: any) {
    console.error("❌ PDF export error:", err);
    return NextResponse.json(
      { error: err.message || "PDF export failed" },
      { status: 500 }
    );
  }
}
