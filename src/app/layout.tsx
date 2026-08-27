import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { GoogleTags } from "@/components/google-tags";
import { getWebsiteSettings } from "@/lib/website";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const s = await getWebsiteSettings();
  const base = s.canonicalUrl && s.canonicalUrl.startsWith('http') ? s.canonicalUrl : 'https://smartcalendar.app';
  const keywords = (s.seoKeywords || '').split(',').map((k) => k.trim()).filter(Boolean);
  return {
    metadataBase: new URL(base),
    title: s.seoTitle || s.siteName,
    description: s.seoDescription,
    keywords,
    authors: [{ name: s.siteName }],
    manifest: '/manifest.json',
    robots: s.indexable ? { index: true, follow: true } : { index: false, follow: false },
    verification: s.googleSiteVerification ? { google: s.googleSiteVerification } : undefined,
    icons: {
      icon: [
        { url: s.logoUrl || '/favicon.svg', type: 'image/svg+xml' },
        { url: '/icon.png', sizes: '192x192', type: 'image/png' },
        { url: '/favicon.ico', sizes: '32x32' },
      ],
      apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
      shortcut: '/favicon.ico',
    },
    openGraph: {
      title: s.seoTitle || s.siteName,
      description: s.seoDescription,
      url: s.canonicalUrl,
      siteName: s.siteName,
      type: 'website',
      images: s.ogImageUrl ? [{ url: s.ogImageUrl }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: s.seoTitle || s.siteName,
      description: s.seoDescription,
      images: s.ogImageUrl ? [s.ogImageUrl] : undefined,
    },
    alternates: { canonical: s.canonicalUrl },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const s = await getWebsiteSettings();
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: s.siteName,
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Web',
    description: s.seoDescription,
    url: s.canonicalUrl,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
  };

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <GoogleTags
          gaMeasurementId={s.gaMeasurementId}
          gtmContainerId={s.gtmContainerId}
          googleAdsId={s.googleAdsId}
        />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
