'use client';

import React, { useState } from 'react';
import Link from 'next/link';
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
  // ROI Calculator State
  const [facultyCount, setFacultyCount] = useState<number>(60);
  const [activeFeatureTab, setActiveFeatureTab] = useState<string>('ai-timetable');
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Calculations for ROI Calculator
  const hoursSavedPerMonth = Math.round(facultyCount * 0.8 + 24);
  const moneySavedPerYear = (facultyCount * 4500).toLocaleString('en-IN');
  const subDelayReduced = '45 min → 30 sec';

  const faqs = [
    {
      q: 'How fast can AI Smart Calendar generate a complete school timetable?',
      a: 'Using our multi-constraint CSP (Constraint Satisfaction Problem) algorithm, a complete 1,200–2,400 period master timetable across Grades 1 to 12 is generated in under 60 seconds with zero double-booked rooms or teacher clashes.',
    },
    {
      q: 'Does it integrate with our existing Biometric Attendance machines?',
      a: 'Yes! We support standard HTTP/TCP push webhooks from ZKTeco, eSSL, Matrix, BioMax, and Hikvision devices. Unrecorded morning punches automatically flag absent teachers and trigger instant substitution suggestions.',
    },
    {
      q: 'How do substitute teachers receive their period assignments?',
      a: 'As soon as an administrator approves a substitution (or AI auto-assigns it), the substitute teacher receives a formatted WhatsApp message and in-app push notification with grade, section, period, and curriculum topics.',
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
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-blue-600 selection:text-white font-sans antialiased overflow-x-hidden">
      {/* ── Background Glow Elements ── */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[10%] w-[500px] h-[500px] bg-blue-600/15 rounded-full blur-[120px]" />
        <div className="absolute top-[30%] right-[5%] w-[450px] h-[450px] bg-indigo-600/15 rounded-full blur-[140px]" />
        <div className="absolute bottom-[10%] left-[20%] w-[600px] h-[600px] bg-sky-500/10 rounded-full blur-[150px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:48px_48px]" />
      </div>

      {/* ── Sticky Navbar ── */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-slate-950/80 border-b border-slate-800/80 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          <Link href="/landing" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-700 to-slate-900 flex items-center justify-center shadow-lg shadow-blue-500/25 group-hover:scale-105 transition-transform">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
                AI Smart Calendar
              </span>
              <span className="hidden sm:inline-block ml-2 text-[10px] uppercase tracking-widest font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                SaaS v2.0
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
            <a href="#features" className="hover:text-blue-400 transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-blue-400 transition-colors">How It Works</a>
            <a href="#calculator" className="hover:text-blue-400 transition-colors">ROI Calculator</a>
            <a href="#pricing" className="hover:text-blue-400 transition-colors">Pricing</a>
            <a href="#faq" className="hover:text-blue-400 transition-colors">FAQ</a>
          </nav>

          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" className="text-slate-300 hover:text-white hover:bg-slate-800/60 text-xs sm:text-sm">
                Sign In
              </Button>
            </Link>
            <Link href="/login">
              <Button className="bg-gradient-to-r from-blue-600 via-indigo-700 to-slate-900 hover:from-blue-700 hover:to-slate-950 text-white font-bold shadow-lg shadow-blue-500/20 text-xs sm:text-sm px-5 h-10 rounded-xl border border-blue-400/20">
                Launch Workspace <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero Section ── */}
      <section className="relative z-10 pt-16 pb-20 sm:pt-24 sm:pb-28 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold mb-8 animate-pulse">
          <Sparkles className="w-3.5 h-3.5 text-amber-300" />
          <span>Next-Generation AI Timetable & Substitution OS · NEP 2020 Compliant</span>
        </div>

        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight max-w-5xl mx-auto leading-[1.1] mb-6">
          The Intelligent Operating System for <span className="bg-gradient-to-r from-blue-400 via-indigo-300 to-sky-400 bg-clip-text text-transparent">Modern Schools</span>
        </h1>

        <p className="text-lg sm:text-xl text-slate-400 max-w-3xl mx-auto font-normal leading-relaxed mb-10">
          Automate clash-free master timetables in 60 seconds, detect teacher absences via Biometric IoT punches, and alert substitutes on WhatsApp in real time.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
          <Link href="/login" className="w-full sm:w-auto">
            <Button size="lg" className="w-full sm:w-auto h-13 px-8 text-base font-bold bg-gradient-to-r from-blue-600 via-indigo-700 to-slate-900 hover:from-blue-700 hover:to-slate-950 text-white rounded-2xl shadow-xl shadow-blue-500/25 border border-blue-400/20 transition-all hover:scale-[1.02]">
              Start Free School Pilot <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Link>
          <a href="#how-it-works" className="w-full sm:w-auto">
            <Button size="lg" variant="outline" className="w-full sm:w-auto h-13 px-7 text-base font-semibold border-slate-700/80 bg-slate-900/60 hover:bg-slate-800 text-slate-200 rounded-2xl">
              Explore Live Architecture
            </Button>
          </a>
        </div>

        {/* ── Interactive Live Preview Mockup ── */}
        <div className="relative max-w-5xl mx-auto rounded-3xl p-2 bg-gradient-to-b from-slate-800/80 to-slate-900/80 border border-slate-700/60 shadow-2xl shadow-blue-950/40">
          <div className="rounded-2xl overflow-hidden bg-slate-950 p-4 sm:p-6 border border-slate-800 text-left">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-4 mb-5">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <div className="w-3 h-3 rounded-full bg-blue-500/80" />
                <span className="text-xs font-medium text-slate-400 ml-2">Delhi Public School (DPS2025) &middot; Live Timetable Studio</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> 0 Hard Clashes
                </span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  182 Active Faculty
                </span>
              </div>
            </div>

            {/* Grid Snippet */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
                <p className="text-[10px] text-slate-500 font-semibold mb-1">PERIOD 1 (09:30 - 10:15)</p>
                <p className="font-bold text-slate-100">Mathematics</p>
                <p className="text-blue-400 text-[11px]">Priya Sharma &middot; 10-A</p>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
                <p className="text-[10px] text-slate-500 font-semibold mb-1">PERIOD 2 (10:15 - 11:00)</p>
                <p className="font-bold text-slate-100">Physics Lab</p>
                <p className="text-indigo-400 text-[11px]">Dr. Homi Bhabha &middot; 11-B</p>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
                <p className="text-[10px] text-slate-500 font-semibold mb-1">PERIOD 3 (11:15 - 12:00)</p>
                <p className="font-bold text-slate-100">English Literature</p>
                <p className="text-sky-400 text-[11px]">Arundhati Roy &middot; 9-C</p>
              </div>
              <div className="p-3 rounded-xl bg-blue-950/40 border border-blue-500/30">
                <p className="text-[10px] text-blue-400 font-semibold mb-1">AI AUTO-SUBSTITUTE</p>
                <p className="font-bold text-slate-100">Chemistry</p>
                <p className="text-blue-300 text-[11px]">📲 WhatsApp Alert Sent</p>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
                <p className="text-[10px] text-slate-500 font-semibold mb-1">PERIOD 5 (01:30 - 02:15)</p>
                <p className="font-bold text-slate-100">Computer Science</p>
                <p className="text-purple-400 text-[11px]">Nandan Nilekani &middot; 12-A</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Impact Metrics Strip ── */}
      <section className="relative z-10 border-y border-slate-800/80 bg-slate-900/40 backdrop-blur-md py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <p className="text-3xl sm:text-4xl font-extrabold bg-gradient-to-r from-blue-400 to-indigo-300 bg-clip-text text-transparent">180+</p>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 font-medium">Educational Institutions</p>
            </div>
            <div>
              <p className="text-3xl sm:text-4xl font-extrabold bg-gradient-to-r from-indigo-400 to-sky-300 bg-clip-text text-transparent">99.8%</p>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 font-medium">Clash-Free Timetable Accuracy</p>
            </div>
            <div>
              <p className="text-3xl sm:text-4xl font-extrabold bg-gradient-to-r from-sky-400 to-blue-300 bg-clip-text text-transparent">30 Sec</p>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 font-medium">Instant Substitution Resolution</p>
            </div>
            <div>
              <p className="text-3xl sm:text-4xl font-extrabold bg-gradient-to-r from-blue-300 to-indigo-400 bg-clip-text text-transparent">25,000+</p>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 font-medium">Empowered Students & Faculty</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature Deep-Dive Grid ── */}
      <section id="features" className="relative z-10 py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 mb-3">Enterprise Core Features</Badge>
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight mb-4">
            Engineered for High-Performance Academic Operations
          </h2>
          <p className="text-slate-400 text-base sm:text-lg">
            Everything your school leadership, coordinators, and teachers need in a unified cloud platform.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Feature 1 */}
          <Card className="bg-slate-900/60 border-slate-800 hover:border-blue-500/40 transition-all duration-300 hover:shadow-xl hover:shadow-blue-950/20 group">
            <CardContent className="p-7">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-5 group-hover:scale-110 transition-transform">
                <Brain className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-100 mb-2">AI Timetable Studio & CSP Solver</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Generate 100% clash-free schedules across Grades 1–12, handling room constraints, lab double periods, and teacher availability rules instantly.
              </p>
            </CardContent>
          </Card>

          {/* Feature 2 */}
          <Card className="bg-slate-900/60 border-slate-800 hover:border-indigo-500/40 transition-all duration-300 hover:shadow-xl hover:shadow-indigo-950/20 group">
            <CardContent className="p-7">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-5 group-hover:scale-110 transition-transform">
                <Zap className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-100 mb-2">Biometric IoT Punch Synchronization</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Integrates with ZKTeco, eSSL, and Matrix attendance devices. Morning absences automatically flag affected periods and generate replacement options.
              </p>
            </CardContent>
          </Card>

          {/* Feature 3 */}
          <Card className="bg-slate-900/60 border-slate-800 hover:border-sky-500/40 transition-all duration-300 hover:shadow-xl hover:shadow-sky-950/20 group">
            <CardContent className="p-7">
              <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 mb-5 group-hover:scale-110 transition-transform">
                <MessageSquare className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-100 mb-2">WhatsApp & SMS Instant Dispatch</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Substitute teachers receive immediate WhatsApp alerts with period numbers, class sections, and today’s curriculum topic directly on their phones.
              </p>
            </CardContent>
          </Card>

          {/* Feature 4 */}
          <Card className="bg-slate-900/60 border-slate-800 hover:border-blue-500/40 transition-all duration-300 hover:shadow-xl hover:shadow-blue-950/20 group">
            <CardContent className="p-7">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-5 group-hover:scale-110 transition-transform">
                <Printer className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-100 mb-2">1-Click High-Res PDF Timetable Print</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Generate clean, official A4 Landscape printable formats for classroom notice boards, student handbooks, and faculty room master charts.
              </p>
            </CardContent>
          </Card>

          {/* Feature 5 */}
          <Card className="bg-slate-900/60 border-slate-800 hover:border-indigo-500/40 transition-all duration-300 hover:shadow-xl hover:shadow-indigo-950/20 group">
            <CardContent className="p-7">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-5 group-hover:scale-110 transition-transform">
                <Layers className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-100 mb-2">Single-Domain Multi-Tenant SaaS</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Isolated database partitions for every school branch, automated tenant detection, and centralized management on a single unified domain with zero DNS setup.
              </p>
            </CardContent>
          </Card>

          {/* Feature 6 */}
          <Card className="bg-slate-900/60 border-slate-800 hover:border-sky-500/40 transition-all duration-300 hover:shadow-xl hover:shadow-sky-950/20 group">
            <CardContent className="p-7">
              <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 mb-5 group-hover:scale-110 transition-transform">
                <BarChart3 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-100 mb-2">Teacher Wellbeing & Workload Intelligence</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Monitor faculty stress scores, prevent unfair substitution overload, and adhere to standard NEP weekly teaching hour recommendations.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── Interactive ROI Calculator ── */}
      <section id="calculator" className="relative z-10 py-20 bg-slate-900/50 border-y border-slate-800/80">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 mb-3">Interactive Savings Calculator</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">Calculate Your School’s Time & Cost Savings</h2>
            <p className="text-slate-400 text-sm sm:text-base">
              See how much administrative time and substitution chaos your school can eliminate each month.
            </p>
          </div>

          <div className="bg-slate-950 rounded-3xl p-6 sm:p-10 border border-slate-800 shadow-2xl">
            <div className="mb-8">
              <div className="flex justify-between items-center mb-3">
                <label className="text-sm font-semibold text-slate-300">Total School Faculty Size:</label>
                <span className="text-lg font-bold text-blue-400 bg-blue-950/60 px-3 py-1 rounded-lg border border-blue-500/30">
                  {facultyCount} Teachers
                </span>
              </div>
              <input
                type="range"
                min="10"
                max="300"
                step="5"
                value={facultyCount}
                onChange={(e) => setFacultyCount(Number(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex justify-between text-[11px] text-slate-500 mt-2">
                <span>10 Faculty</span>
                <span>150 Faculty</span>
                <span>300 Faculty</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 text-center">
              <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800">
                <p className="text-3xl sm:text-4xl font-extrabold text-blue-400 mb-1">{hoursSavedPerMonth} hrs</p>
                <p className="text-xs font-semibold text-slate-300">Admin Hours Saved / Month</p>
                <p className="text-[11px] text-slate-500 mt-1">Zero manual clash checking</p>
              </div>

              <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800">
                <p className="text-3xl sm:text-4xl font-extrabold text-indigo-400 mb-1">{subDelayReduced}</p>
                <p className="text-xs font-semibold text-slate-300">Morning Substitution Speed</p>
                <p className="text-[11px] text-slate-500 mt-1">Automated biometric trigger</p>
              </div>

              <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800">
                <p className="text-3xl sm:text-4xl font-extrabold text-sky-400 mb-1">₹{moneySavedPerYear}</p>
                <p className="text-xs font-semibold text-slate-300">Estimated Annual Efficiency Gain</p>
                <p className="text-[11px] text-slate-500 mt-1">Operational cost reduction</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3-Step "How It Works" ── */}
      <section id="how-it-works" className="relative z-10 py-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <Badge className="bg-indigo-500/10 text-indigo-400 border-indigo-500/20 mb-3">Simple 3-Step Workflow</Badge>
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight mb-4">
            From Chaos to Complete Order in Minutes
          </h2>
          <p className="text-slate-400 text-base sm:text-lg">
            How educational institutions modernize their scheduling workflow with AI Smart Calendar.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="relative p-8 rounded-3xl bg-slate-900/50 border border-slate-800 text-center flex flex-col items-center">
            <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 font-extrabold text-xl mb-6">
              1
            </div>
            <h3 className="text-lg font-bold text-slate-100 mb-2">Import Teacher & Class Data</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Upload your spreadsheet or Excel roster with teacher subjects, grades, and room requirements in one click.
            </p>
          </div>

          <div className="relative p-8 rounded-3xl bg-slate-900/50 border border-slate-800 text-center flex flex-col items-center">
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-extrabold text-xl mb-6">
              2
            </div>
            <h3 className="text-lg font-bold text-slate-100 mb-2">AI Generates 100% Clash-Free Grid</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Our constraint solver places all 2,400 periods perfectly with balanced workloads and verified lab slots.
            </p>
          </div>

          <div className="relative p-8 rounded-3xl bg-slate-900/50 border border-slate-800 text-center flex flex-col items-center">
            <div className="w-14 h-14 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 font-extrabold text-xl mb-6">
              3
            </div>
            <h3 className="text-lg font-bold text-slate-100 mb-2">Automate Daily Substitutions & Print</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Biometric morning absences trigger instant WhatsApp alerts to substitutes and 1-click A4 classroom PDF prints.
            </p>
          </div>
        </div>
      </section>

      {/* ── FAQ Section ── */}
      <section id="faq" className="relative z-10 py-24 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 mb-3">Frequently Asked Questions</Badge>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">Got Questions? We’ve Got Answers</h2>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div
                key={idx}
                className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden transition-colors"
              >
                <button
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  className="w-full p-5 text-left flex justify-between items-center text-sm sm:text-base font-bold text-slate-100 hover:text-blue-400 transition-colors"
                >
                  <span>{faq.q}</span>
                  <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${isOpen ? 'rotate-90 text-blue-400' : 'text-slate-500'}`} />
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 text-xs sm:text-sm text-slate-400 leading-relaxed border-t border-slate-800/60 pt-4">
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
        <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 border border-blue-500/30 p-8 sm:p-14 text-center shadow-2xl">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight mb-4">
              Ready to Upgrade Your School’s Academic Operations?
            </h2>
            <p className="text-slate-300 text-sm sm:text-lg mb-8 font-normal">
              Join leading educational institutions managing timetables, substitutions, and faculty wellbeing with AI Smart Calendar.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/login" className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto h-13 px-8 text-base font-bold bg-gradient-to-r from-blue-600 via-indigo-700 to-slate-900 hover:from-blue-700 hover:to-slate-950 text-white rounded-2xl shadow-xl shadow-blue-500/30">
                  Launch School Workspace <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <Link href="/login" className="w-full sm:w-auto">
                <Button size="lg" variant="outline" className="w-full sm:w-auto h-13 px-7 text-base font-semibold border-blue-500/40 bg-blue-950/40 hover:bg-blue-900/60 text-blue-300 rounded-2xl">
                  Try Demo School (DPS2025)
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Modern Footer ── */}
      <footer className="relative z-10 border-t border-slate-800/80 bg-slate-950 py-12 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold">
              <Brain className="w-4 h-4" />
            </div>
            <span className="font-bold text-slate-300">AI Smart Calendar SaaS</span>
            <span>&copy; {new Date().getFullYear()} All Rights Reserved.</span>
          </div>

          <div className="flex items-center gap-6 text-slate-400">
            <Link href="/login" className="hover:text-blue-400 transition-colors">School Login</Link>
            <Link href="#features" className="hover:text-blue-400 transition-colors">Features</Link>
            <Link href="#pricing" className="hover:text-blue-400 transition-colors">Pricing</Link>
            <Link href="/brochure" className="hover:text-blue-400 transition-colors">Brochure</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
