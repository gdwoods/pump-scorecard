// app/api/debug-env/route.ts
import { NextResponse } from "next/server";
import {
  ASKEDGAR_ENV_KEYS,
  getAskEdgarApiKeyFromEnv,
} from "@/lib/topGainers";

export async function GET() {
  const polygonKey = process.env.POLYGON_API_KEY || null;
  const googleVisionKey = process.env.GOOGLE_CLOUD_VISION_API_KEY || null;
  const askEdgarEffective = getAskEdgarApiKeyFromEnv();
  const askEdgarPresence: Record<string, boolean> = {};
  for (const k of ASKEDGAR_ENV_KEYS) {
    askEdgarPresence[k] = Boolean(process.env[k]?.trim());
  }

  return NextResponse.json({
    polygonVars: {
      POLYGON_API_KEY: polygonKey,
    },
    polygonKeyLength: polygonKey ? polygonKey.trim().length : 0,
    googleVisionVars: {
      GOOGLE_CLOUD_VISION_API_KEY: googleVisionKey ? `${googleVisionKey.substring(0, 10)}...` : null,
    },
    googleVisionKeyLength: googleVisionKey ? googleVisionKey.trim().length : 0,
    googleVisionKeySet: !!googleVisionKey,
    askEdgar: {
      effectiveKeyLength: askEdgarEffective.length,
      effectiveKeySet: askEdgarEffective.length > 0,
      whichVarsHaveValue: askEdgarPresence,
      checkedNames: [...ASKEDGAR_ENV_KEYS],
    },
    vercelEnv: process.env.VERCEL_ENV || "unknown",
    vercelRegion: process.env.VERCEL_REGION || "unknown",
    nodeVersion: process.version,
    runtime: "nodejs",
  });
}
