import { NextRequest, NextResponse } from 'next/server';

/**
 * Disabled: depends on a BehavioralInsight model and a relational Section
 * entity, neither of which exist in the current schema. This is a missing
 * feature (would need a new table), not a naming mismatch.
 */
export async function GET(_req: NextRequest) {
  return NextResponse.json({ success: false, error: 'Behavioral insights are not available in the current schema.' }, { status: 501 });
}

export async function POST(_req: NextRequest) {
  return NextResponse.json({ success: false, error: 'Behavioral insights are not available in the current schema.' }, { status: 501 });
}
