import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import os from 'os';
import { isSuperAdminRequest, unauthorized } from '@/lib/superadmin';

export const dynamic = 'force-dynamic';

async function checkMongo() {
  const started = Date.now();
  try {
    await db.$runCommandRaw({ ping: 1 });
    const [schools, teachers, payments, coupons] = await Promise.all([
      db.school.count(),
      db.teacher.count(),
      db.payment.count().catch(() => 0),
      db.coupon.count().catch(() => 0),
    ]);
    return {
      status: 'healthy' as const,
      latencyMs: Date.now() - started,
      collections: { schools, teachers, payments, coupons },
    };
  } catch (error) {
    return {
      status: 'unhealthy' as const,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkGroq() {
  const configured = Boolean(process.env.GROQ_API_KEY);
  if (!configured) return { status: 'unconfigured' as const, configured: false };
  const started = Date.now();
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      cache: 'no-store',
    });
    return {
      status: res.ok ? ('healthy' as const) : ('degraded' as const),
      configured: true,
      latencyMs: Date.now() - started,
      httpStatus: res.status,
    };
  } catch (error) {
    return {
      status: 'unhealthy' as const,
      configured: true,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function GET(request: Request) {
  if (!isSuperAdminRequest(request)) return unauthorized();

  const mem = process.memoryUsage();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();

  let queuedNotifications = 0;
  let generationJobs = 0;
  try {
    queuedNotifications = await db.notificationDelivery.count({
      where: { status: { in: ['queued', 'retry'] } },
    });
  } catch {}
  try {
    generationJobs = await db.generationJob.count({
      where: { status: { in: ['queued', 'running'] } },
    });
  } catch {}

  const [mongo, groq] = await Promise.all([checkMongo(), checkGroq()]);

  const services = [
    { id: 'api', name: 'Application server', status: 'healthy' as const, detail: `uptime ${Math.round(process.uptime())}s` },
    { id: 'mongodb', name: 'MongoDB Atlas', ...mongo },
    { id: 'groq', name: 'Groq AI', ...groq },
    {
      id: 'zai',
      name: 'ZAI / GLM',
      status: process.env.ZAI_API_KEY ? ('configured' as const) : ('unconfigured' as const),
      configured: Boolean(process.env.ZAI_API_KEY),
    },
  ];

  const unhealthy = services.filter((s) => s.status === 'unhealthy').length;
  const overall = unhealthy > 0 ? 'unhealthy' : services.some((s) => s.status === 'degraded') ? 'degraded' : 'healthy';

  return NextResponse.json({
    overall,
    timestamp: new Date().toISOString(),
    server: {
      node: process.version,
      platform: `${os.platform()} ${os.release()}`,
      hostname: os.hostname(),
      env: process.env.NODE_ENV || 'development',
      uptimeSec: Math.round(process.uptime()),
      pid: process.pid,
      cpus: os.cpus().length,
      load: os.loadavg(),
    },
    memory: {
      rssMb: Math.round(mem.rss / 1024 / 1024),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
      systemUsedPct: Math.round(((totalMem - freeMem) / totalMem) * 100),
      systemFreeMb: Math.round(freeMem / 1024 / 1024),
      systemTotalMb: Math.round(totalMem / 1024 / 1024),
    },
    queues: {
      notificationDeliveries: queuedNotifications,
      generationJobs,
    },
    services,
  });
}
