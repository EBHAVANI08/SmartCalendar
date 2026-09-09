'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Brain, Sparkles, CalendarDays, Users, ShieldCheck, Zap,
  Printer, MessageSquare, Clock, CheckCircle2, ChevronRight,
  BarChart3, Award, HelpCircle, FileSpreadsheet, ArrowRight,
  Flame, Lock, Check, Layers, UserCheck, Star
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

export function LandingClient() {
  const [activeFeatureTab, setActiveFeatureTab] = useState<string>('ai-timetable');
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [site, setSite] = useState<any>(null);

  useEffect(() => {
    fetch('/api/website')
      .then((r) => r.json())
      .then(setSite)
      .catch(() => {});
  }, []);

  const faqs = [
    {
      q: 'How fast can AI Smart Calendar generate a complete school timetable?',
      a: 'Using a multi-constraint CSP (Constraint Satisfaction Problem) solver, a full master timetable across Grades 1 to 12 is generated with every placement validated, so no teacher, class or room is double-booked. Requirements that cannot be staffed are reported to you rather than filled with an unqualified teacher clashes.',
    },
    {
      q: 'Does it integrate with our existing Biometric Attendance machines?',
      a: 'Yes! We support standard HTTP/TCP push webhooks from ZKTeco, eSSL, Matrix, BioMax, and Hikvision devices. Unrecorded morning punches automatically flag absent teachers and trigger instant substitution suggestions.',
    },
    {
      q: 'How do substitute teachers receive their period assignments?',
      a: 'As soon as an administrator approves a substitution (or the assistant proposes one), the substitute teacher receives an in-app notification with grade, section, period, and curriculum topics.',
    },
    {
      q: 'Is each school’s data private and isolated?',
      a: 'Absolutely. Smart Calendar is a true multi-tenant SaaS architecture running on a single domain. Each school operates in an isolated data partition with encrypted credentials, role-based access control, and auto-detected workspace sessions.',
    },
    {
      q: 'Can we print physical timetables for classroom notice boards?',
      a: 'Yes. Our 1-Click PDF Engine generates high-resolution, print-ready A4 landscape layouts for class notice boards and teacher faculty rooms with official signature blocks.',
    },
  ];
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 selection:bg-blue-600 selection:text-white font-sans antialiased overflow-x-hidden">
      {site?.maintenanceMode && (
        <div className="relative z-50 bg-amber-500 text-slate-950 text-center text-sm font-bold py-2">
          Maintenance mode is on. Public visitors see the live site; you can still edit from Owner Console.
        </div>
      )}
      {site?.announcementEnabled && site?.announcement && (
        <div className="relative z-50 bg-blue-600 text-white text-center text-sm font-semibold py-2 px-4">
          {site.announcement}
        </div>
      )}
      {/* ── Background Subtle Glow Elements ── */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[10%] w-[500px] h-[500px] bg-blue-400/8 rounded-full blur-[120px]" />
        <div className="absolute top-[30%] right-[5%] w-[450px] h-[450px] bg-indigo-400/8 rounded-full blur-[140px]" />
        <div className="absolute bottom-[10%] left-[20%] w-[600px] h-[600px] bg-sky-300/10 rounded-full blur-[150px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.025)_1px,transparent_1px)] bg-[size:48px_48px]" />
      </div>

      {/* ── Sticky Navbar (Light Theme) ── */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/90 border-b border-slate-200/80 transition-all shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <Link href="/landing" className="flex items-center group py-1">
            <Image
              src="/logo.png?v=3"
              alt="Smart Calendar for Schools"
              width={300}
              height={75}
              className="h-12 sm:h-14 w-auto object-contain transition-transform group-hover:scale-[1.02]"
              priority
              unoptimized
            />
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-600">
            <a href="#features" className="hover:text-blue-600 transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-blue-600 transition-colors">How It Works</a>
            <a href="#faq" className="hover:text-blue-600 transition-colors">FAQ</a>
            <Link href="/brochure" className="hover:text-blue-600 transition-colors">Brochure</Link>
          </nav>

          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" className="text-slate-700 hover:text-blue-600 hover:bg-slate-100 text-xs sm:text-sm font-semibold">
                Sign In
              </Button>
            </Link>
            <Link href="/login">
              <Button className="bg-gradient-to-r from-blue-600 via-indigo-700 to-slate-900 hover:from-blue-700 hover:to-slate-950 text-white font-bold shadow-md shadow-blue-500/20 text-xs sm:text-sm px-5 h-10 rounded-xl border-none">
                Launch Workspace <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero Section (Light Theme) ── */}
      <section className="relative z-10 pt-16 pb-20 sm:pt-24 sm:pb-28 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {site?.heroImageUrl && (
          <div className="mb-10 rounded-3xl overflow-hidden border border-slate-200 max-h-[360px] shadow-md">
            <img src={site.heroImageUrl} alt={site.siteName || 'Hero'} className="w-full h-[280px] sm:h-[360px] object-cover" />
          </div>
        )}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold mb-8 shadow-xs">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span>{site?.heroBadge || 'Next-Generation AI Timetable & Substitution OS · NEP 2020 Compliant'}</span>
        </div>

        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight max-w-5xl mx-auto leading-[1.1] mb-6 text-slate-900">
          {site?.heroTitle || <>The Intelligent Operating System for <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-slate-900 bg-clip-text text-transparent">Modern Schools</span></>}
        </h1>

        <p className="text-lg sm:text-xl text-slate-600 max-w-3xl mx-auto font-normal leading-relaxed mb-10">
          {site?.heroSubtitle || 'Build validated, clash-checked master timetables, capture teacher absences from biometric attendance, and resolve substitutions with qualified, available staff.'}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
          <Link href="/login" className="w-full sm:w-auto">
            <Button size="lg" className="w-full sm:w-auto h-13 px-8 text-base font-bold bg-gradient-to-r from-blue-600 via-indigo-700 to-slate-900 hover:from-blue-700 hover:to-slate-950 text-white rounded-2xl shadow-xl shadow-blue-500/20 border-none transition-all hover:scale-[1.02]">
              {site?.ctaPrimary || 'Sign In to Workspace'} <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Link>
          <a href="#how-it-works" className="w-full sm:w-auto">
            <Button size="lg" variant="outline" className="w-full sm:w-auto h-13 px-7 text-base font-semibold border-slate-300 bg-white hover:bg-slate-50 text-slate-800 rounded-2xl shadow-xs">
              Explore Architecture
            </Button>
          </a>
        </div>

        {/* ── Interactive Live Preview Mockup ── */}
        <div className="relative max-w-5xl mx-auto rounded-3xl p-2.5 bg-gradient-to-b from-slate-100 to-slate-200 border border-slate-200/90 shadow-2xl shadow-slate-200/80">
          <div className="rounded-2xl overflow-hidden bg-white p-4 sm:p-6 border border-slate-200/80 text-left shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-rose-400" />
                <div className="w-3 h-3 rounded-full bg-amber-400" />
                <div className="w-3 h-3 rounded-full bg-emerald-400" />
                <span className="text-xs font-semibold text-slate-700 ml-2">Live Master Timetable Studio &middot; Schedule Grid</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> 0 Clashes Verified
                </span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                  Active Master Schedule
                </span>
              </div>
            </div>

            {/* Grid Snippet in Clean Light Mode */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90">
                <p className="text-[10px] text-slate-500 font-semibold mb-1">PERIOD 1 (09:00 - 09:45)</p>
                <p className="font-bold text-slate-900">Mathematics</p>
                <p className="text-blue-600 text-[11px] font-medium">Faculty Assigned &middot; Grade 10-A</p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90">
                <p className="text-[10px] text-slate-500 font-semibold mb-1">PERIOD 2 (09:45 - 10:30)</p>
                <p className="font-bold text-slate-900">Physics Lab</p>
                <p className="text-indigo-600 text-[11px] font-medium">Science Dept &middot; Lab 2</p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90">
                <p className="text-[10px] text-slate-500 font-semibold mb-1">PERIOD 3 (10:45 - 11:30)</p>
                <p className="font-bold text-slate-900">English Literature</p>
                <p className="text-sky-600 text-[11px] font-medium">Faculty Assigned &middot; Grade 9-B</p>
              </div>
              <div className="p-3.5 rounded-xl bg-blue-50/80 border border-blue-200">
                <p className="text-[10px] text-blue-700 font-bold mb-1">AUTO-SUBSTITUTION</p>
                <p className="font-bold text-slate-900">Chemistry</p>
                <p className="text-blue-700 text-[11px] font-medium">Cover Assigned &middot; In-App Alert</p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90">
                <p className="text-[10px] text-slate-500 font-semibold mb-1">PERIOD 5 (01:15 - 02:00)</p>
                <p className="font-bold text-slate-900">Computer Science</p>
                <p className="text-purple-600 text-[11px] font-medium">IT Dept &middot; Lab 1</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Capability Strip (Light Theme) ── */}
      <section className="relative z-10 border-y border-slate-200 bg-white/80 backdrop-blur-md py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <p className="text-xl sm:text-2xl font-black bg-gradient-to-r from-blue-700 to-indigo-700 bg-clip-text text-transparent">AI-Assisted</p>
              <p className="text-xs sm:text-sm text-slate-600 mt-1 font-semibold">Timetable Generation</p>
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-black bg-gradient-to-r from-indigo-700 to-sky-700 bg-clip-text text-transparent">Real-Time</p>
              <p className="text-xs sm:text-sm text-slate-600 mt-1 font-semibold">Conflict Detection</p>
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-black bg-gradient-to-r from-sky-700 to-blue-700 bg-clip-text text-transparent">Automated</p>
              <p className="text-xs sm:text-sm text-slate-600 mt-1 font-semibold">Substitution Workflow</p>
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-black bg-gradient-to-r from-blue-800 to-indigo-800 bg-clip-text text-transparent">Multi-Tenant</p>
              <p className="text-xs sm:text-sm text-slate-600 mt-1 font-semibold">School Management</p>
            </div>
          </div>
          <p className="text-center text-[11px] text-slate-500 mt-8 font-medium">
            Core capabilities available today. Generation runs with clash validation enabled.
          </p>
        </div>
      </section>

      {/* ── Feature Deep-Dive Grid (Light Theme) ── */}
      <section id="features" className="relative z-10 py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <Badge className="bg-blue-50 text-blue-700 border-blue-200 mb-3 font-semibold">Enterprise Core Features</Badge>
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4 text-slate-900">
            Engineered for High-Performance Academic Operations
          </h2>
          <p className="text-slate-600 text-base sm:text-lg">
            Everything your school leadership, coordinators, and teachers need in a unified cloud platform.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Feature 1 */}
          <Card className="bg-white border-slate-200/90 hover:border-blue-300 hover:shadow-xl hover:shadow-slate-200/60 transition-all duration-300 group">
            <CardContent className="p-7">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 mb-5 group-hover:scale-105 transition-transform shadow-xs">
                <Brain className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">AI Timetable Studio & CSP Solver</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Generate 100% clash-free schedules across Grades 1–12, handling room constraints, lab double periods, and teacher availability rules instantly.
              </p>
            </CardContent>
          </Card>

          {/* Feature 2 */}
          <Card className="bg-white border-slate-200/90 hover:border-indigo-300 hover:shadow-xl hover:shadow-slate-200/60 transition-all duration-300 group">
            <CardContent className="p-7">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 mb-5 group-hover:scale-105 transition-transform shadow-xs">
                <Zap className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Biometric IoT Punch Synchronization</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Integrates with ZKTeco, eSSL, and Matrix attendance devices. Morning absences automatically flag affected periods and generate replacement options.
              </p>
            </CardContent>
          </Card>

          {/* Feature 3 */}
          <Card className="bg-white border-slate-200/90 hover:border-sky-300 hover:shadow-xl hover:shadow-slate-200/60 transition-all duration-300 group">
            <CardContent className="p-7">
              <div className="w-12 h-12 rounded-2xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600 mb-5 group-hover:scale-105 transition-transform shadow-xs">
                <MessageSquare className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">In-App Substitution Notifications</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Substitute teachers get an in-app notification carrying the period, class section and the day’s topic with one-tap status confirmation.
              </p>
            </CardContent>
          </Card>

          {/* Feature 4 */}
          <Card className="bg-white border-slate-200/90 hover:border-blue-300 hover:shadow-xl hover:shadow-slate-200/60 transition-all duration-300 group">
            <CardContent className="p-7">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 mb-5 group-hover:scale-105 transition-transform shadow-xs">
                <Printer className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">1-Click High-Res PDF Timetable Print</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Generate clean, official A4 Landscape printable formats for classroom notice boards, student handbooks, and faculty room master charts.
              </p>
            </CardContent>
          </Card>

          {/* Feature 5 */}
          <Card className="bg-white border-slate-200/90 hover:border-indigo-300 hover:shadow-xl hover:shadow-slate-200/60 transition-all duration-300 group">
            <CardContent className="p-7">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 mb-5 group-hover:scale-105 transition-transform shadow-xs">
                <Layers className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Single-Domain Multi-Tenant SaaS</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Isolated database partitions for every school branch, automated tenant detection, and centralized management on a single unified domain with zero DNS setup.
              </p>
            </CardContent>
          </Card>

          {/* Feature 6 */}
          <Card className="bg-white border-slate-200/90 hover:border-sky-300 hover:shadow-xl hover:shadow-slate-200/60 transition-all duration-300 group">
            <CardContent className="p-7">
              <div className="w-12 h-12 rounded-2xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600 mb-5 group-hover:scale-105 transition-transform shadow-xs">
                <BarChart3 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Teacher Wellbeing & Workload Intelligence</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Monitor faculty stress scores, prevent unfair substitution overload, and adhere to standard NEP weekly teaching hour recommendations.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── 3-Step "How It Works" (Light Theme) ── */}
      <section id="how-it-works" className="relative z-10 py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 mb-3 font-semibold">Simple 3-Step Workflow</Badge>
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4 text-slate-900">
            From Chaos to Complete Order in Minutes
          </h2>
          <p className="text-slate-600 text-base sm:text-lg">
            How educational institutions modernize their scheduling workflow with AI Smart Calendar.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="relative p-8 rounded-3xl bg-white border border-slate-200/90 text-center flex flex-col items-center shadow-xs">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700 font-black text-xl mb-6 shadow-xs">
              1
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Import Teacher & Class Data</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Upload your spreadsheet or Excel roster with teacher subjects, grades, and room requirements in one click.
            </p>
          </div>

          <div className="relative p-8 rounded-3xl bg-white border border-slate-200/90 text-center flex flex-col items-center shadow-xs">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700 font-black text-xl mb-6 shadow-xs">
              2
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Constraint-Checked Generation</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              The constraint solver places periods with balanced workloads and room requirements, rejecting any assignment that would double-book a teacher, class or room.
            </p>
          </div>

          <div className="relative p-8 rounded-3xl bg-white border border-slate-200/90 text-center flex flex-col items-center shadow-xs">
            <div className="w-14 h-14 rounded-2xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-700 font-black text-xl mb-6 shadow-xs">
              3
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Automate Substitutions & Print</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Biometric morning absences surface the affected periods for substitution, with 1-click A4 classroom PDF prints.
            </p>
          </div>
        </div>
      </section>

      {/* ── FAQ Section (Light Theme) ── */}
      <section id="faq" className="relative z-10 py-24 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <Badge className="bg-blue-50 text-blue-700 border-blue-200 mb-3 font-semibold">Frequently Asked Questions</Badge>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-3 text-slate-900">Got Questions? We’ve Got Answers</h2>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div
                key={idx}
                className="rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden transition-colors"
              >
                <button
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  className="w-full p-5 text-left flex justify-between items-center text-sm sm:text-base font-bold text-slate-900 hover:text-blue-600 transition-colors"
                >
                  <span>{faq.q}</span>
                  <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${isOpen ? 'rotate-90 text-blue-600' : 'text-slate-400'}`} />
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 text-xs sm:text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-4">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── High-Impact CTA Banner ── */}
      <section className="relative z-10 py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900 p-8 sm:p-14 text-center shadow-xl">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight mb-4">
              Ready to Modernize Your School’s Timetable Workflow?
            </h2>
            <p className="text-slate-200 text-sm sm:text-lg mb-8 font-normal">
              Modernize your school’s timetable and substitution workflow with AI Smart Calendar.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/login" className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto h-13 px-8 text-base font-bold bg-white text-slate-950 hover:bg-slate-100 rounded-2xl shadow-lg shadow-black/20 border-none">
                  Launch Demo Workspace <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <Link href="/brochure" className="w-full sm:w-auto">
                <Button size="lg" variant="outline" className="w-full sm:w-auto h-13 px-7 text-base font-semibold border-white/30 bg-white/10 hover:bg-white/20 text-white rounded-2xl">
                  Download Brochure
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Modern Footer (Light Theme) ── */}
      <footer className="relative z-10 border-t border-slate-200 bg-white pt-14 pb-10 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-start gap-10 pb-10 border-b border-slate-100">
            {/* Brand column with prominent logo */}
            <div className="max-w-md space-y-4">
              <Link href="/landing" className="inline-block group">
                <Image
                  src="/logo.png?v=3"
                  alt="Smart Calendar for Schools"
                  width={280}
                  height={70}
                  className="h-12 sm:h-14 w-auto object-contain transition-transform group-hover:scale-[1.02]"
                  unoptimized
                />
              </Link>
              <p className="text-slate-600 text-sm leading-relaxed">
                The Intelligent Operating System for Modern Schools. AI-driven timetable generation, IoT biometric absence detection, and instant WhatsApp substitution management.
              </p>
              <div className="flex items-center gap-2 text-slate-500 font-medium text-xs">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                NEP 2020 &amp; CBSE Guidelines Compliant
              </div>
            </div>

            {/* Quick Links Navigation */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-8 text-sm">
              <div className="space-y-3">
                <p className="font-bold text-slate-900 tracking-wide text-xs uppercase">Product</p>
                <ul className="space-y-2 text-slate-600">
                  <li><a href="#features" className="hover:text-blue-600 transition-colors">AI Timetable</a></li>
                  <li><a href="#features" className="hover:text-blue-600 transition-colors">Substitution Engine</a></li>
                  <li><a href="#how-it-works" className="hover:text-blue-600 transition-colors">How It Works</a></li>
                  <li><a href="#faq" className="hover:text-blue-600 transition-colors">FAQ</a></li>
                </ul>
              </div>

              <div className="space-y-3">
                <p className="font-bold text-slate-900 tracking-wide text-xs uppercase">Portals</p>
                <ul className="space-y-2 text-slate-600">
                  <li><Link href="/login" className="hover:text-blue-600 transition-colors">School Login</Link></li>
                  <li><Link href="/login" className="hover:text-blue-600 transition-colors">Faculty Station</Link></li>
                  <li><Link href="/brochure" className="hover:text-blue-600 transition-colors">Product Brochure</Link></li>
                </ul>
              </div>

              <div className="space-y-3 col-span-2 sm:col-span-1">
                <p className="font-bold text-slate-900 tracking-wide text-xs uppercase">Security</p>
                <ul className="space-y-2 text-slate-600">
                  <li><span className="text-slate-500">Tenant Isolation</span></li>
                  <li><span className="text-slate-500">RBAC Protected</span></li>
                  <li><span className="text-slate-500">Daily Encrypted Backup</span></li>
                </ul>
              </div>
            </div>
          </div>

          {/* Bottom Copyright Bar */}
          <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-slate-500 text-xs">
            <p>&copy; {new Date().getFullYear()} Smart Calendar for Schools. All Rights Reserved.</p>
            <p className="text-slate-400">
              Empowering Education with Intelligent Automation
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
