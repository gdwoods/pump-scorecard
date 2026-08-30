// app/api/forensic-brief/export-pdf/route.ts
//
// Render-only forensic brief PDF from deterministic fact pack + cached thesis.
// No Groq call — client sends the same ThesisPromptInput used for AI thesis.

import { NextRequest, NextResponse } from 'next/server';
import type { AiThesisResult, ThesisPromptInput } from '@/lib/ai/types';
import { buildForensicFactPack } from '@/lib/forensic/buildFactPack';
import { renderForensicBriefPdf } from '@/lib/forensic/renderForensicBriefPdf';

export const runtime = 'nodejs';
export const maxDuration = 30;

function isValidThesis(value: unknown): value is AiThesisResult {
  if (!value || typeof value !== 'object') return false;
  const t = value as Record<string, unknown>;
  return typeof t.summary === 'string' && typeof t.thesis === 'string';
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { input?: ThesisPromptInput; thesis?: AiThesisResult };

    if (!body?.input?.ticker) {
      return NextResponse.json({ error: 'input.ticker is required' }, { status: 400 });
    }

    if (!isValidThesis(body.thesis)) {
      return NextResponse.json(
        { error: 'thesis is required — generate AI thesis first' },
        { status: 400 }
      );
    }

    const factPack = buildForensicFactPack(body.input);
    const pdfBytes = await renderForensicBriefPdf(factPack, body.thesis);
    const ticker = factPack.ticker;

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${ticker}_forensic-brief.pdf"`,
      },
    });
  } catch (error) {
    console.error('Forensic brief PDF error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'PDF generation failed' },
      { status: 500 }
    );
  }
}
