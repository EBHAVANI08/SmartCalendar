'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';

export default function WebsiteSeoPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<'content' | 'images' | 'google'>('content');
  const [settings, setSettings] = useState<any>(null);
  const [media, setMedia] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const load = () => {
    fetch('/api/superadmin/website')
      .then((r) => r.json())
      .then((d) => {
        setSettings(d.settings);
        setMedia(d.media || []);
      });
  };
  useEffect(() => { load(); }, []);

  const save = async (patch?: Record<string, unknown>) => {
    setSaving(true);
    const res = await fetch('/api/superadmin/website', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...settings, ...patch }),
    });
    const d = await res.json();
    setSaving(false);
    if (!res.ok) {
      toast({ title: 'Save failed', description: d.error, variant: 'destructive' });
      return;
    }
    setSettings(d.settings);
    toast({ title: 'Website updated', description: 'Landing page, SEO and Google tags now use these values.' });
  };

  const upload = async (file: File, kind = 'gallery') => {
    const fd = new FormData();
    fd.set('file', file);
    fd.set('kind', kind);
    const res = await fetch('/api/superadmin/website/media', { method: 'POST', body: fd });
    const d = await res.json();
    if (!res.ok) {
      toast({ title: 'Upload failed', description: d.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'Image uploaded' });
    load();
  };

  const useAs = async (url: string, field: string) => {
    await save({ [field]: url });
  };

  if (!settings) return <p className="text-sm text-slate-500">Loading website settings…</p>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Website & SEO</h1>
        <p className="text-sm text-slate-500 mt-1">
          Control the public landing page, banners, Google Search / Analytics, sitemap and robots from here. Preview at{' '}
          <a className="text-violet-700 font-semibold" href="/" target="_blank">homepage</a>.
        </p>
      </div>

      <div className="flex gap-2">
        {(['content', 'images', 'google'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-lg text-sm font-bold capitalize ${tab === t ? 'bg-violet-700 text-white' : 'bg-white border text-slate-600'}`}>
            {t === 'google' ? 'SEO & Google' : t}
          </button>
        ))}
      </div>

      {tab === 'content' && (
        <Card className="py-0">
          <CardContent className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><Label>Site name</Label><Input value={settings.siteName || ''} onChange={(e) => setSettings({ ...settings, siteName: e.target.value })} /></div>
            <div><Label>Tagline</Label><Input value={settings.tagline || ''} onChange={(e) => setSettings({ ...settings, tagline: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>Hero badge</Label><Input value={settings.heroBadge || ''} onChange={(e) => setSettings({ ...settings, heroBadge: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>Hero title</Label><Input value={settings.heroTitle || ''} onChange={(e) => setSettings({ ...settings, heroTitle: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>Hero subtitle</Label><Textarea value={settings.heroSubtitle || ''} onChange={(e) => setSettings({ ...settings, heroSubtitle: e.target.value })} /></div>
            <div><Label>Primary button</Label><Input value={settings.ctaPrimary || ''} onChange={(e) => setSettings({ ...settings, ctaPrimary: e.target.value })} /></div>
            <div><Label>Secondary button</Label><Input value={settings.ctaSecondary || ''} onChange={(e) => setSettings({ ...settings, ctaSecondary: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>Announcement bar</Label><Input value={settings.announcement || ''} onChange={(e) => setSettings({ ...settings, announcement: e.target.value })} /></div>
            <label className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
              Show announcement <Switch checked={Boolean(settings.announcementEnabled)} onCheckedChange={(v) => setSettings({ ...settings, announcementEnabled: v })} />
            </label>
            <label className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
              Maintenance flag <Switch checked={Boolean(settings.maintenanceMode)} onCheckedChange={(v) => setSettings({ ...settings, maintenanceMode: v })} />
            </label>
            <div className="md:col-span-2">
              <Button disabled={saving} onClick={() => save()} className="bg-violet-700 hover:bg-violet-800">Save content</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'images' && (
        <div className="space-y-4">
          <Card className="py-0">
            <CardContent className="p-5 space-y-3">
              <Label>Upload banner / logo / OG image (PNG, JPG, WebP · max 4 MB)</Label>
              <Input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
              <p className="text-xs text-slate-500">After upload, click Use as hero / Use as Google share image / Use as logo.</p>
            </CardContent>
          </Card>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {media.map((m) => (
              <Card key={m.id} className="py-0 overflow-hidden">
                <CardContent className="p-0">
                  <img src={m.url} alt={m.alt || m.filename} className="h-28 w-full object-cover" />
                  <div className="p-2 space-y-1">
                    <p className="text-[10px] truncate text-slate-500">{m.filename}</p>
                    <div className="flex flex-wrap gap-1">
                      <Button size="sm" variant="outline" className="h-7 text-[10px] px-2" onClick={() => useAs(m.url, 'heroImageUrl')}>Hero</Button>
                      <Button size="sm" variant="outline" className="h-7 text-[10px] px-2" onClick={() => useAs(m.url, 'ogImageUrl')}>SEO share</Button>
                      <Button size="sm" variant="outline" className="h-7 text-[10px] px-2" onClick={() => useAs(m.url, 'logoUrl')}>Logo</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {media.length === 0 && <p className="text-sm text-slate-500">No images yet. Upload a school campus photo for the hero banner.</p>}
        </div>
      )}

      {tab === 'google' && (
        <Card className="py-0">
          <CardContent className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2"><Label>SEO title</Label><Input value={settings.seoTitle || ''} onChange={(e) => setSettings({ ...settings, seoTitle: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>SEO description</Label><Textarea value={settings.seoDescription || ''} onChange={(e) => setSettings({ ...settings, seoDescription: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>Keywords (comma separated)</Label><Input value={settings.seoKeywords || ''} onChange={(e) => setSettings({ ...settings, seoKeywords: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>Canonical / live site URL</Label><Input value={settings.canonicalUrl || ''} onChange={(e) => setSettings({ ...settings, canonicalUrl: e.target.value })} placeholder="https://yourdomain.com" /></div>
            <div><Label>Google Analytics (GA4) ID</Label><Input value={settings.gaMeasurementId || ''} onChange={(e) => setSettings({ ...settings, gaMeasurementId: e.target.value })} placeholder="G-XXXXXXXX" /></div>
            <div><Label>Google Tag Manager</Label><Input value={settings.gtmContainerId || ''} onChange={(e) => setSettings({ ...settings, gtmContainerId: e.target.value })} placeholder="GTM-XXXXXXX" /></div>
            <div><Label>Search Console verification</Label><Input value={settings.googleSiteVerification || ''} onChange={(e) => setSettings({ ...settings, googleSiteVerification: e.target.value })} placeholder="meta content token" /></div>
            <div><Label>Google Ads ID</Label><Input value={settings.googleAdsId || ''} onChange={(e) => setSettings({ ...settings, googleAdsId: e.target.value })} placeholder="AW-XXXXXXX" /></div>
            <label className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm md:col-span-2">
              Allow Google to index the site
              <Switch checked={Boolean(settings.indexable)} onCheckedChange={(v) => setSettings({ ...settings, indexable: v })} />
            </label>
            <div className="md:col-span-2 text-xs text-slate-500 space-y-1">
              <p>Sitemap: <a className="text-violet-700" href="/sitemap.xml" target="_blank">/sitemap.xml</a></p>
              <p>Robots: <a className="text-violet-700" href="/robots.txt" target="_blank">/robots.txt</a></p>
              <p>In Search Console, add the property, paste the verification token above, then submit the sitemap URL.</p>
            </div>
            <div className="md:col-span-2">
              <Button disabled={saving} onClick={() => save()} className="bg-violet-700 hover:bg-violet-800">Save SEO & Google</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
