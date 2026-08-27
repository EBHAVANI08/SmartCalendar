import { db } from '@/lib/db';
import type { WebsiteSettings } from '@prisma/client';

export const WEBSITE_DEFAULTS = {
  key: 'default',
  siteName: 'AI Smart Calendar',
  tagline: 'The Intelligent Operating System for Modern Schools',
  heroBadge: 'Next-Generation AI Timetable & Substitution OS · NEP 2020 Compliant',
  heroTitle: 'The Intelligent Operating System for Modern Schools',
  heroSubtitle:
    'Automate clash-free master timetables in 60 seconds, detect teacher absences via Biometric IoT punches, and alert substitutes on WhatsApp in real time.',
  ctaPrimary: 'Start Free School Pilot',
  ctaSecondary: 'Try Demo School',
  announcement: '',
  announcementEnabled: false,
  maintenanceMode: false,
  seoTitle: 'AI Smart Calendar — The Intelligent Operating System for Modern Schools',
  seoDescription:
    'AI-powered school timetable generation, biometric absence detection, instant WhatsApp substitution alerts, and multi-tenant school management.',
  seoKeywords: 'AI School Timetable, Smart Calendar, Teacher Substitution, Biometric Attendance, School SaaS, NEP 2020',
  canonicalUrl: 'https://smartcalendar.app',
  ogImageUrl: '' as string | null,
  heroImageUrl: '' as string | null,
  logoUrl: '' as string | null,
  gaMeasurementId: '' as string | null,
  gtmContainerId: '' as string | null,
  googleSiteVerification: '' as string | null,
  googleAdsId: '' as string | null,
  indexable: true,
};

export async function getWebsiteSettings(): Promise<WebsiteSettings | typeof WEBSITE_DEFAULTS> {
  try {
    const existing = await db.websiteSettings.findUnique({ where: { key: 'default' } });
    if (existing) return existing;
    return await db.websiteSettings.create({ data: { key: 'default' } });
  } catch {
    return WEBSITE_DEFAULTS;
  }
}

export function publicWebsitePayload(s: WebsiteSettings | typeof WEBSITE_DEFAULTS) {
  return {
    siteName: s.siteName,
    tagline: s.tagline,
    heroBadge: s.heroBadge,
    heroTitle: s.heroTitle,
    heroSubtitle: s.heroSubtitle,
    ctaPrimary: s.ctaPrimary,
    ctaSecondary: s.ctaSecondary,
    announcement: s.announcement,
    announcementEnabled: s.announcementEnabled,
    maintenanceMode: s.maintenanceMode,
    heroImageUrl: s.heroImageUrl,
    logoUrl: s.logoUrl,
    canonicalUrl: s.canonicalUrl,
  };
}
