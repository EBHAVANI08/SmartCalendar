import { NextRequest, NextResponse } from 'next/server';

/**
 * Disabled: depends on a PostSubReport model and relational
 * Section/CurriculumSubject tables that do not exist in the current schema.
 * This is a missing feature (would need new tables), not a naming mismatch.
 */
export async function GET(_req: NextRequest) {
  return NextResponse.json({ success: false, error: 'Post-substitution reports are not available in the current schema.' }, { status: 501 });
}

export async function POST(_req: NextRequest) {
  return NextResponse.json({ success: false, error: 'Post-substitution reports are not available in the current schema.' }, { status: 501 });
}
