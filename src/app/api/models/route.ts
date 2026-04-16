import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Returns the list of available providers and their configuration status.
 * Frontend uses this to show/hide provider groups in the model selector.
 */
export async function GET() {
  return NextResponse.json({
    providers: {
      groq: {
        available: !!process.env.GROQ_API_KEY,
      },
      nvidia: {
        available: !!process.env.NVIDIA_API_KEY,
      },
    },
  });
}
