import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

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

export const metadata: Metadata = {
  title: "AI Smart Calendar – Intelligent School Management",
  description: "AI Smart Calendar – Intelligent school management system for schedules, substitutions, and lesson planning. Powered by AI.",
  keywords: ["AI Smart Calendar", "School Management", "Academic Calendar", "Teacher Scheduling", "Substitutions", "AI Timetable"],
  authors: [{ name: "AI Smart Calendar" }],
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon.png", sizes: "192x192", type: "image/png" },
      { url: "/favicon.ico", sizes: "32x32" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
  },
  openGraph: {
    title: "AI Smart Calendar – Intelligent School Management",
    description: "AI-powered school timetable, substitutions & lesson planning platform.",
    url: "https://chat.z.ai",
    siteName: "AI Smart Calendar",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Smart Calendar",
    description: "AI-powered school timetable, substitutions & lesson planning platform.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
