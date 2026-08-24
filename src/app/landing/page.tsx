import type { Metadata } from 'next';
import { LandingClient } from './landing-client';

export const metadata: Metadata = {
  title: 'AI Smart Calendar — The Intelligent Operating System for Modern Schools',
  description:
    'AI-powered school timetable generation, biometric absence detection, instant WhatsApp substitution alerts, and multi-tenant school management compliant with NEP 2020 & CBSE.',
  keywords: [
    'AI School Timetable Generator',
    'Smart School Calendar',
    'Automated Teacher Substitution',
    'Biometric Attendance School',
    'WhatsApp Teacher Notification',
    'School SaaS Management',
    'NEP 2020 Timetable Software',
  ],
  openGraph: {
    title: 'AI Smart Calendar — Next-Gen School Management Platform',
    description:
      'Generate clash-free master timetables in 60s, automate substitutions via biometric IoT, and alert teachers instantly on WhatsApp.',
    type: 'website',
    url: 'https://smartcalendar.app',
  },
};

export default function LandingPage() {
  return <LandingClient />;
}
