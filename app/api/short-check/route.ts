// app/api/short-check/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { extractDataFromImage } from '@/lib/ocrParser';
import { calculateShortRating } from '@/lib/shortCheckScoring';
import { fetchDebtCashFromYahoo } from '@/utils/fetchDebtCash';
import { fetchHistoricalOS } from '@/utils/fetchHistoricalOS';

export const runtime = 'nodejs';
export const maxDuration = 60; // OCR can take time

export async function POST(req: NextRequest) {
  try {
    console.log('Short check API: Received POST request');
    
    // Parse form data
    const formData = await req.formData();
    const file = formData.get('image') as File | null;
    
    console.log('Short check API: File received:', file ? { name: file.name, type: file.type, size: file.size } : 'null');
    
    if (!file) {
      console.error('Short check API: No file provided');
      return NextResponse.json(
        { error: 'No image file provided' },
        { status: 400 }
      );
    }
    
    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      console.error('Short check API: Invalid file type:', file.type);
      return NextResponse.json(
        { error: 'Invalid file type. Please upload PNG or JPG.' },
        { status: 400 }
      );
    }
    
    // Validate file size (max 4MB for Vercel serverless function limit)
    // Vercel has a 4.5MB limit for request bodies, so we use 4MB as safe margin
    const maxSize = 4 * 1024 * 1024; // 4MB
    if (file.size > maxSize) {
      console.error('Short check API: File too large:', file.size);
      return NextResponse.json(
        { error: 'File too large. Maximum size is 4MB. Please compress your image or use a smaller screenshot.' },
        { status: 400 }
      );
    }
    
    console.log('Short check API: Converting file to buffer...');
    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    console.log('Short check API: Buffer created, size:', buffer.length);
    
    console.log('Short check API: Starting OCR extraction...');
    // Extract data using OCR
    let extractedData;
    try {
      extractedData = await extractDataFromImage(buffer);
      console.log('Short check API: OCR extraction complete:', JSON.stringify(extractedData, null, 2));
      
      // If we don't have actual debt data (only Net Cash from DT), try fetching from Yahoo Finance
      if (extractedData.hasActualDebtData === false && extractedData.ticker) {
        console.log(`Short check API: Missing debt data, fetching from Yahoo Finance for ${extractedData.ticker}...`);
        try {
          const debtCashData = await fetchDebtCashFromYahoo(extractedData.ticker);
          if (debtCashData.debt !== null || debtCashData.cash !== null) {
            // Update extracted data with Yahoo Finance values
            if (debtCashData.debt !== null) {
              extractedData.debt = debtCashData.debt;
            }
            // Only update cash if we didn't already have it from OCR
            if (debtCashData.cash !== null && extractedData.cashOnHand === undefined) {
              extractedData.cashOnHand = debtCashData.cash;
            }
            // Mark that we now have actual debt data and note the source
            extractedData.hasActualDebtData = true;
            extractedData.debtCashSource = 'yahoo-finance';
            console.log(`Short check API: Fetched debt/cash from Yahoo Finance:`, debtCashData);
          } else {
            console.log(`Short check API: Yahoo Finance did not return debt/cash data`);
          }
        } catch (yahooError) {
          console.error('Short check API: Failed to fetch debt/cash from Yahoo Finance:', yahooError);
          // Continue with OCR data only - don't fail the whole request
        }
      }
      
      // Fetch historical O/S for Historical Dilution calculation
      if (extractedData.ticker && extractedData.outstandingShares) {
        console.log(`Short check API: Fetching historical O/S for ${extractedData.ticker}...`);
        try {
          const historicalOSResult = await fetchHistoricalOS(extractedData.ticker);
          if (historicalOSResult.shares !== null) {
            extractedData.outstandingShares3YearsAgo = historicalOSResult.shares;
            extractedData.historicalOSSource = historicalOSResult.source;
            console.log(`Short check API: Fetched historical O/S: ${historicalOSResult.shares} (source: ${historicalOSResult.source})`);
          } else {
            console.log(`Short check API: No historical O/S data available from any source`);
          }
        } catch (error) {
          console.error('Short check API: Failed to fetch historical O/S:', error);
          // Continue without historical data - scoring will use default
        }
      }
      
      // Calculate rating even with partial data - scoring framework handles missing fields
      console.log('Short check API: Calculating short rating...');
      const result = calculateShortRating(extractedData);
      
      return NextResponse.json({
        success: true,
        extractedData,
        result,
      });
    } catch (ocrError) {
      console.error('Short check API: OCR failed:', ocrError);
      // Return error response so user can use manual entry
      return NextResponse.json({
        success: false,
        error: 'OCR processing failed. Please use manual entry instead.',
        errorDetails: ocrError instanceof Error ? ocrError.message : 'Unknown OCR error',
        extractedData: {
          confidence: 0,
        },
      }, { status: 200 }); // Return 200 so frontend can handle gracefully
    }
  } catch (error) {
    console.error('Short check API error:', error);
    if (error instanceof Error) {
      console.error('Error stack:', error.stack);
    }
    return NextResponse.json(
      {
        error: 'Failed to process image',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Handle manual override submission (when user provides data manually)
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { extractedData } = body;
    
    if (!extractedData) {
      return NextResponse.json(
        { error: 'No data provided' },
        { status: 400 }
      );
    }
    
    // Calculate short rating with manual data
    const result = calculateShortRating(extractedData);
    
    return NextResponse.json({
      success: true,
      extractedData,
      result,
    });
  } catch (error) {
    console.error('Short check manual API error:', error);
    return NextResponse.json(
      {
        error: 'Failed to calculate rating',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

