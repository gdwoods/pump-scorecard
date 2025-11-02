// app/api/short-check/export-pdf/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ticker, result, extractedData } = body;

    if (!ticker || !result) {
      return NextResponse.json(
        { error: 'Missing required data: ticker or result' },
        { status: 400 }
      );
    }

    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // US Letter size
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    let yPosition = 750;
    const pageWidth = 612;
    const margin = 50;
    const contentWidth = pageWidth - (margin * 2);
    const lineHeight = 20;
    const sectionSpacing = 15;

    let currentPage = page;
    
    // Helper function to add text with word wrapping
    const addText = (text: string, x: number, y: number, size: number = 10, isBold: boolean = false) => {
      const currentFont = isBold ? boldFont : font;
      const words = text.split(' ');
      let currentLine = '';
      let currentY = y;
      
      for (const word of words) {
        const testLine = currentLine + (currentLine ? ' ' : '') + word;
        const textWidth = currentFont.widthOfTextAtSize(testLine, size);
        
        if (textWidth > contentWidth && currentLine) {
          currentPage.drawText(currentLine, {
            x,
            y: currentY,
            size,
            font: currentFont,
          });
          currentLine = word;
          currentY -= lineHeight;
          
          // Check if we need a new page
          if (currentY < margin + 50) {
            currentPage = pdfDoc.addPage([612, 792]);
            currentY = 750;
          }
        } else {
          currentLine = testLine;
        }
      }
      
      if (currentLine) {
        currentPage.drawText(currentLine, {
          x,
          y: currentY,
          size,
          font: currentFont,
        });
      }
      
      return currentY - lineHeight;
    };

    // Helper to add section header
    const addSectionHeader = (text: string, y: number) => {
      if (y < margin + 50) {
        currentPage = pdfDoc.addPage([612, 792]);
        y = 750;
      }
      currentPage.drawText(text, {
        x: margin,
        y,
        size: 14,
        font: boldFont,
        color: rgb(0, 0, 0.8),
      });
      return y - lineHeight - 5;
    };

    // Title
    yPosition = addSectionHeader(`Short Check Analysis - ${ticker.toUpperCase()}`, yPosition);
    yPosition -= sectionSpacing;

    // Date
    const dateStr = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    yPosition = addText(`Generated: ${dateStr}`, margin, yPosition, 10, false);
    yPosition -= lineHeight * 0.5;

    // Main Rating
    yPosition = addSectionHeader('Overall Rating', yPosition);
    yPosition -= 10;
    
    const ratingColor = result.category === 'High-Priority Short Candidate' 
      ? rgb(0.8, 0, 0)
      : result.category === 'Moderate Short Candidate'
      ? rgb(0.8, 0.6, 0)
      : result.category === 'Speculative Short Candidate'
      ? rgb(0, 0.4, 0.8)
      : rgb(0, 0.6, 0);
    
    currentPage.drawText(`Rating: ${result.rating.toFixed(1)}%`, {
      x: margin,
      y: yPosition,
      size: 16,
      font: boldFont,
      color: ratingColor,
    });
    yPosition -= lineHeight;
    
    currentPage.drawText(`Category: ${result.category}`, {
      x: margin,
      y: yPosition,
      size: 12,
      font: font,
    });
    yPosition -= lineHeight * 1.5;

    // Alert Labels
    if (result.alertLabels && result.alertLabels.length > 0) {
      const alertText = `Alerts: ${result.alertLabels.map(a => a.label).join(', ')}`;
      yPosition = addText(alertText, margin, yPosition, 10, false);
      yPosition -= lineHeight * 0.5;
    }

    // Risk Synopsis
    if (extractedData) {
      const { generateRiskSynopsis } = await import('@/lib/shortCheckHelpers');
      const synopsis = generateRiskSynopsis(ticker, result.scoreBreakdown, extractedData);
      
      yPosition = addSectionHeader('Risk Synopsis', yPosition);
      yPosition -= 10;
      yPosition = addText(synopsis, margin, yPosition, 10, false);
      yPosition -= sectionSpacing;
    }

    // Score Breakdown
    yPosition = addSectionHeader('Score Breakdown', yPosition);
    yPosition -= 10;
    
    const breakdownItems = [
      { label: 'Droppiness', value: result.scoreBreakdown.droppiness },
      { label: 'Overall Risk', value: result.scoreBreakdown.overallRisk },
      { label: 'Cash Need', value: result.scoreBreakdown.cashNeed },
      { label: 'Cash Runway', value: result.scoreBreakdown.cashRunway },
      { label: 'Offering Ability', value: result.scoreBreakdown.offeringAbility },
      { label: 'Institutional Ownership', value: result.scoreBreakdown.institutionalOwnership },
      { label: 'Float', value: result.scoreBreakdown.float },
      { label: 'Short Interest', value: result.scoreBreakdown.shortInterest },
      { label: 'Historical Dilution', value: result.scoreBreakdown.historicalDilution },
      { label: 'Debt/Cash Ratio', value: result.scoreBreakdown.debtCashRatio },
      { label: 'Price Spike', value: result.scoreBreakdown.priceSpike },
      { label: 'News Catalyst', value: result.scoreBreakdown.newsCatalyst },
    ];

    for (const item of breakdownItems) {
      if (item.value !== undefined) {
        const scoreText = `${item.label}: ${item.value > 0 ? '+' : ''}${item.value.toFixed(1)}`;
        currentPage.drawText(scoreText, {
          x: margin,
          y: yPosition,
          size: 10,
          font: font,
        });
        yPosition -= lineHeight;
        
        if (yPosition < margin + 50) {
          currentPage = pdfDoc.addPage([612, 792]);
          yPosition = 750;
        }
      }
    }
    
    yPosition -= sectionSpacing;

    // Total Score
    currentPage.drawText(`Total Score: ${result.rating.toFixed(1)}%`, {
      x: margin,
      y: yPosition,
      size: 12,
      font: boldFont,
      color: rgb(0, 0, 0.8),
    });
    yPosition -= lineHeight * 1.5;

    // Walk-Away Flags
    if (result.walkAwayFlags && result.walkAwayFlags.length > 0) {
      yPosition = addSectionHeader('Walk-Away Flags', yPosition);
      yPosition -= 10;
      
      for (const flag of result.walkAwayFlags) {
        currentPage.drawText(`• ${flag}`, {
          x: margin + 10,
          y: yPosition,
          size: 10,
          font: font,
          color: rgb(0.8, 0, 0),
        });
        yPosition -= lineHeight;
        
        if (yPosition < margin + 50) {
          currentPage = pdfDoc.addPage([612, 792]);
          yPosition = 750;
        }
      }
      yPosition -= sectionSpacing;
    }

    // Key Metrics (if extractedData available)
    if (extractedData) {
      yPosition = addSectionHeader('Key Metrics', yPosition);
      yPosition -= 10;
      
      const metrics = [];
      if (extractedData.cashRunway) metrics.push(`Cash Runway: ${extractedData.cashRunway} months`);
      if (extractedData.float) metrics.push(`Float: ${(extractedData.float / 1e6).toFixed(2)}M shares`);
      if (extractedData.institutionalOwnership !== undefined) {
        metrics.push(`Institutional Ownership: ${extractedData.institutionalOwnership}%`);
      }
      if (extractedData.currentPrice) {
        metrics.push(`Current Price: $${extractedData.currentPrice.toFixed(2)}`);
      }
      
      for (const metric of metrics) {
        currentPage.drawText(metric, {
          x: margin,
          y: yPosition,
          size: 10,
          font: font,
        });
        yPosition -= lineHeight;
      }
      yPosition -= sectionSpacing;
    }

    // Alert Card
    yPosition = addSectionHeader('Alert Card', yPosition);
    yPosition -= 10;
    
    const alertCardLines = result.alertCard.split('\n').slice(0, 20); // Limit lines
    for (const line of alertCardLines) {
      if (line.trim()) {
        yPosition = addText(line, margin, yPosition, 9, false);
        
        if (yPosition < margin + 50) {
          currentPage = pdfDoc.addPage([612, 792]);
          yPosition = 750;
        }
      }
    }

    // Footer on last page
    const pages = pdfDoc.getPages();
    const lastPage = pages[pages.length - 1];
    lastPage.drawText(
      `Generated by Short Check • ${dateStr}`,
      {
        x: margin,
        y: 30,
        size: 8,
        font: font,
        color: rgb(0.5, 0.5, 0.5),
      }
    );

    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save();

    return new NextResponse(pdfBytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="short-check-${ticker}-${Date.now()}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error('Error generating PDF:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate PDF' },
      { status: 500 }
    );
  }
}

