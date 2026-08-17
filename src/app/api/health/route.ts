import { db } from '@/lib/db'; import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export async function GET() { const started = Date.now(); try { await db.$queryRaw`SELECT 1`; return NextResponse.json({ status: 'healthy', database: 'connected', timestamp: new Date().toISOString(), latencyMs: Date.now() - started, version: process.env.npm_package_version || '0.2.0' }); } catch (error) { return NextResponse.json({ status: 'unhealthy', database: 'disconnected', timestamp: new Date().toISOString(), error: String(error) }, { status: 503 }); } }
