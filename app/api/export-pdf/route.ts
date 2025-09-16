export const runtime = "nodejs";

import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";

export async function POST(req: Request) {
  try {
    const { ticker, result, chartImage, fraudImages } = await req.json();

    // ✅ Ensure fonts exist
    const fontRegular = path.join(process.cwd(), "public", "fonts", "Roboto-Regular.ttf");
    const fontBold = path.join(process.cwd(), "public", "fonts", "Roboto-Bold.ttf");
    const fontMono = path.join(process.cwd(), "public", "fonts", "RobotoMono-Regular.ttf");

    [fontRegular, fontBold, fontMono].forEach((f) => {
      if (!fs.existsSync(f)) {
        throw new Error(`Font not found at ${f}`);
      }
    });

    // ✅ Force font at creation to avoid Helvetica bug
    const doc = new PDFDocument({ margin: 40, font: fontRegular });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    const endPromise = new Promise<Buffer>((resolve, reject) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
    });

    doc.registerFont("Regular", fontRegular);
    doc.registerFont("Bold", fontBold);
    doc.registerFont("Mono", fontMono);

    // Helper for nice section headers
    function sectionHeader(title: string) {
      doc.moveDown();
      doc.font("Bold").fontSize(14);
      const x = doc.x;
      const y = doc.y;
      const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const height = 22;
      doc.rect(x, y, width, height).fill("#f0f0f0");
      doc.fillColor("black").text(` ${title}`, x + 4, y + 5);
      doc.moveDown(2);
    }

    // ---------- Title ----------
    doc.font("Bold").fontSize(20).text(`Pump & Dump Report for ${ticker}`, { align: "center" });
    doc.moveDown(2);

    // ---------- Company Info ----------
    sectionHeader("🏢 Company Information");
    doc.font("Regular").fontSize(12).text(`Company: ${result.companyName || ticker}`);
    doc.text(`Exchange: ${result.exchange}`);
    doc.text(`Country: ${result.country} [${result.countrySource}]`);
    doc.text(`Last Price: $${result.last_price || "N/A"}`);
    doc.text(`Volume: ${result.latest_volume?.toLocaleString() || "N/A"}`);

    // ---------- Risk Scores ----------
    sectionHeader("📊 Risk Scores");
    doc.text(`Flat Risk Score: ${result.flatRiskScore}%`);
    doc.text(`Weighted Risk Score: ${result.weightedRiskScore}%`);

    // ---------- Final Verdict ----------
    sectionHeader("✅ Final Verdict");
    doc.text(result.summaryText || "", { align: "justify" });

    // ---------- Criteria ----------
    sectionHeader("⚖️ Criteria Triggered");
    Object.entries(result).forEach(([key, val]) => {
      if (typeof val === "boolean" && val === true) {
        doc.text(`- ${key}`);
      }
    });

    // ---------- Chart ----------
    if (chartImage) {
      try {
        sectionHeader("📉 Price & Volume Chart");
        const img = chartImage.replace(/^data:image\/png;base64,/, "");
        const buffer = Buffer.from(img, "base64");
        doc.image(buffer, { fit: [450, 300], align: "center" });
      } catch (err) {
        console.error("⚠️ Chart embedding failed:", err);
        doc.font("Mono").fillColor("red").text("⚠️ Chart image failed to embed");
        doc.fillColor("black");
      }
    }

    // ---------- Promotions ----------
    sectionHeader("📢 Promotions");
    if (result.promotions && result.promotions.length > 0) {
      result.promotions.forEach((p: any, idx: number) => {
        doc.text(
          `${idx + 1}. ${p.promotion_date || "N/A"} — ${p.company_name || "Unknown"} — ${p.promoting_firm || "Unknown"}`
        );
        if (p.url) {
          doc.fillColor("blue").text(`Link: ${p.url}`, { link: p.url, underline: true });
          doc.fillColor("black");
        }
        doc.moveDown(0.5);
      });
    } else {
      doc.text("No promotions detected.");
    }

    // ---------- SEC Filings ----------
    sectionHeader("📑 SEC Filings");
    if (result.filings && result.filings.length > 0) {
      result.filings.forEach((f: any, idx: number) => {
        doc.text(`${idx + 1}. ${f.form || "Unknown Form"} — ${f.filingDate || "Unknown Date"}`);
        if (f.url) {
          doc.fillColor("blue").text(`Link: ${f.url}`, { link: f.url, underline: true });
          doc.fillColor("black");
        }
        doc.moveDown(0.5);
      });
    } else {
      doc.text("No recent SEC filings.");
    }

    // ---------- Fraud Evidence ----------
    sectionHeader("⚠️ Fraud Evidence");
    if (fraudImages && fraudImages.length > 0) {
      for (const img of fraudImages.slice(0, 3)) {
        try {
          const res = await fetch(img.full);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const arrBuf = await res.arrayBuffer();
          const buf = Buffer.from(arrBuf);
          doc.image(buf, { fit: [200, 200], align: "center" });
          doc.moveDown();
        } catch (err) {
          console.error("⚠️ Fraud image embedding failed:", err);
          doc.font("Mono").fillColor("red").text("⚠️ Failed to embed fraud image");
          doc.fillColor("black");
        }
      }
    } else {
      doc.text("No fraud images found.");
    }

    doc.end();
    const pdfBuffer = await endPromise;

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=\"${ticker}-report.pdf\"`,
      },
    });
  } catch (err: any) {
    console.error("❌ PDF export route crashed:", err);
    return NextResponse.json({ error: err.message || "PDF export failed" }, { status: 500 });
  }
}
