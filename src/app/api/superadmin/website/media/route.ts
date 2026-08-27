import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { isSuperAdminRequest, unauthorized, writeAudit } from '@/lib/superadmin';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!isSuperAdminRequest(request)) return unauthorized();
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Only image files are allowed' }, { status: 400 });
  }
  if (file.size > 4 * 1024 * 1024) {
    return NextResponse.json({ error: 'Image must be under 4 MB' }, { status: 400 });
  }

  const ext = path.extname(file.name || '') || '.png';
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  const dir = path.join(process.cwd(), 'public', 'uploads', 'website');
  await mkdir(dir, { recursive: true });
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, filename), bytes);
  const url = `/uploads/website/${filename}`;

  const media = await db.websiteMedia.create({
    data: {
      url,
      filename: file.name || filename,
      alt: String(form.get('alt') || ''),
      kind: String(form.get('kind') || 'gallery'),
    },
  });
  await writeAudit(request, 'website.media.upload', 'websiteMedia', media.id, { url });
  return NextResponse.json({ success: true, media }, { status: 201 });
}

export async function DELETE(request: Request) {
  if (!isSuperAdminRequest(request)) return unauthorized();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await db.websiteMedia.delete({ where: { id } });
  await writeAudit(request, 'website.media.delete', 'websiteMedia', id);
  return NextResponse.json({ success: true });
}
