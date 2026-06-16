import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/ai-agent/pre-arrange
 * Disabled: this feature depends on an AbsencePrediction model (predictive
 * absence engine) that does not exist in the current schema. This is a
 * missing feature, not a naming mismatch — reintroducing it requires a new
 * AbsencePrediction table plus a risk-scoring service, not a rewrite.
 */
export async function POST(_request: NextRequest) {
  return NextResponse.json(
    { success: false, error: 'Pre-arrangement (predictive absence) is not available in the current schema.' },
    { status: 501 }
  );
}
