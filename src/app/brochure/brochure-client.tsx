"use client";

/**
 * Print-style tri-fold / A4 brochure layout (image-like panels).
 * Open /brochure → Print / Save PDF for leave-behind.
 */

const FEATURES = [
  { n: "01", t: "Weekly Timetable", d: "Grade & section calendar with your bell timings" },
  { n: "02", t: "Teacher Allotment", d: "Class teachers, subjects & free periods" },
  { n: "03", t: "AI Substitutions", d: "Absent teacher → best free cover, fast" },
  { n: "04", t: "Cover Lesson Plans", d: "Substitute walks in prepared" },
  { n: "05", t: "School Admin Login", d: "One workspace for the whole office" },
  { n: "06", t: "Your Data Only", d: "Isolated school pilot — not shared demos" },
];

export function BrochureClient() {
  return (
    <div className="brochure-root bg-[#dce8e3] text-[#12261f]">
      <style jsx global>{`
        .brochure-root {
          font-family: var(--font-brochure-body), system-ui, sans-serif;
        }
        .brochure-root .display {
          font-family: var(--font-brochure-display), Georgia, serif;
        }
        .panel {
          width: 210mm;
          min-height: 297mm;
          margin: 0 auto 24px;
          background: #fff;
          box-shadow: 0 12px 40px rgba(18, 38, 31, 0.18);
          position: relative;
          overflow: hidden;
        }
        @media screen {
          .brochure-root {
            padding: 24px 12px 48px;
          }
        }
        @media print {
          .no-print {
            display: none !important;
          }
          .brochure-root {
            background: white !important;
            padding: 0 !important;
          }
          .panel {
            box-shadow: none !important;
            margin: 0 !important;
            width: 100% !important;
            min-height: 100vh;
            page-break-after: always;
            break-after: page;
          }
          .panel:last-child {
            page-break-after: auto;
          }
        }
        @page {
          size: A4 portrait;
          margin: 0;
        }
      `}</style>

      {/* Screen controls */}
      <div className="no-print mx-auto mb-6 flex max-w-[210mm] flex-wrap items-center justify-between gap-3 px-1">
        <p className="text-sm font-semibold text-[#12261f]/80">
          Brochure · 3 panels · A4 print
        </p>
        <div className="flex gap-2">
          <a
            href="/"
            className="rounded-full border border-[#12261f]/20 bg-white px-4 py-2 text-xs font-medium"
          >
            Open app
          </a>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-full bg-[#0f6b5c] px-4 py-2 text-xs font-semibold text-white"
          >
            Print / Save PDF
          </button>
        </div>
      </div>

      {/* ═══════════════ PANEL 1 — FRONT COVER ═══════════════ */}
      <article className="panel flex flex-col">
        {/* Full-bleed top visual */}
        <div className="relative h-[42%] min-h-[180px] bg-[#0f6b5c]">
          <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-[#7dcaa0]/30" />
          <div className="absolute bottom-8 left-8 h-32 w-32 rounded-full bg-[#12261f]/25" />
          <div className="absolute right-10 top-1/3 h-20 w-20 rounded-full border-2 border-white/20" />
          <div className="absolute inset-0 flex flex-col justify-between p-8 md:p-10">
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-[#b8e0d0]">
              School management platform
            </p>
            <div>
              <p className="display text-5xl leading-none text-white md:text-6xl">
                AI Smart
                <br />
                Calendar
              </p>
            </div>
          </div>
        </div>

        {/* Cover copy */}
        <div className="flex flex-1 flex-col justify-between p-8 md:p-10">
          <div>
            <p className="display text-2xl leading-snug text-[#0f6b5c] md:text-3xl">
              Every period covered.
              <br />
              Every morning calmer.
            </p>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-[#3d524c]">
              Timetable, teacher allotment, and AI substitutions — so your school
              office runs the day with clarity.
            </p>
          </div>

          <div className="mt-10 border-t border-[#12261f]/10 pt-6">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="display text-2xl text-[#0f6b5c]">3–8</p>
                <p className="text-[10px] uppercase tracking-wide text-[#3d524c]">Grades ready</p>
              </div>
              <div>
                <p className="display text-2xl text-[#0f6b5c]">24</p>
                <p className="text-[10px] uppercase tracking-wide text-[#3d524c]">Teachers</p>
              </div>
              <div>
                <p className="display text-2xl text-[#0f6b5c]">15</p>
                <p className="text-[10px] uppercase tracking-wide text-[#3d524c]">Min demo</p>
              </div>
            </div>
            <p className="mt-6 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-[#12261f]/50">
              Client pilot · Leave-behind brochure
            </p>
          </div>
        </div>
      </article>

      {/* ═══════════════ PANEL 2 — INSIDE (FEATURES + PILOT) ═══════════════ */}
      <article className="panel flex flex-col p-8 md:p-10">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#0f6b5c]">
          What you get
        </p>
        <h2 className="display mt-2 text-3xl text-[#12261f]">Built for school mornings</h2>

        {/* Pain / gain strip */}
        <div className="mt-6 grid grid-cols-2 overflow-hidden rounded-xl text-xs">
          <div className="bg-[#12261f] px-3 py-2 font-semibold uppercase tracking-wide text-white">
            Without us
          </div>
          <div className="bg-[#0f6b5c] px-3 py-2 font-semibold uppercase tracking-wide text-white">
            With us
          </div>
          <div className="border-t border-white/10 bg-[#f4f7f6] px-3 py-2.5 text-[#44554f]">
            Paper / Excel timetable scramble
          </div>
          <div className="border-t border-white/10 bg-[#e8f5f0] px-3 py-2.5 font-medium text-[#0f6b5c]">
            Live weekly calendar by class
          </div>
          <div className="border-t border-[#12261f]/5 bg-[#f4f7f6] px-3 py-2.5 text-[#44554f]">
            Late cover for absent teachers
          </div>
          <div className="border-t border-[#0f6b5c]/10 bg-[#e8f5f0] px-3 py-2.5 font-medium text-[#0f6b5c]">
            AI picks free, fitting substitute
          </div>
          <div className="border-t border-[#12261f]/5 bg-[#f4f7f6] px-3 py-2.5 text-[#44554f]">
            Cover teacher unprepared
          </div>
          <div className="border-t border-[#0f6b5c]/10 bg-[#e8f5f0] px-3 py-2.5 font-medium text-[#0f6b5c]">
            Lesson plan ready for the period
          </div>
        </div>

        {/* Feature grid — brochure tiles */}
        <div className="mt-8 grid grid-cols-2 gap-3">
          {FEATURES.map((f) => (
            <div
              key={f.n}
              className="rounded-xl border border-[#12261f]/8 bg-[#f4f7f6] p-3"
            >
              <p className="text-[10px] font-bold text-[#0f6b5c]">{f.n}</p>
              <p className="display mt-0.5 text-base leading-tight">{f.t}</p>
              <p className="mt-1 text-[11px] leading-snug text-[#3d524c]">{f.d}</p>
            </div>
          ))}
        </div>

        {/* Pilot pack band */}
        <div className="mt-auto pt-8">
          <div className="rounded-2xl bg-[#0f6b5c] p-5 text-white">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#b8e0d0]">
              Live pilot included
            </p>
            <p className="display mt-1 text-xl">Client Pilot · Grades 3–8</p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px]">
              <div className="rounded-lg bg-white/10 py-2">
                <p className="display text-lg">24</p>
                <p className="text-white/70">Teachers</p>
              </div>
              <div className="rounded-lg bg-white/10 py-2">
                <p className="display text-lg">17</p>
                <p className="text-white/70">Classes</p>
              </div>
              <div className="rounded-lg bg-white/10 py-2">
                <p className="display text-lg">680</p>
                <p className="text-white/70">Periods</p>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-[#d7efe6]">
              Class-teacher Period 1 · Wednesday PT for Grades 3–5 · school bell timings
            </p>
          </div>
        </div>
      </article>

      {/* ═══════════════ PANEL 3 — BACK (DEMO + LOGIN + CTA) ═══════════════ */}
      <article className="panel flex flex-col p-8 md:p-10">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#0f6b5c]">
          During your visit
        </p>
        <h2 className="display mt-2 text-3xl">15-minute walkthrough</h2>

        <ol className="mt-6 space-y-0 border-l-2 border-[#0f6b5c]/30 pl-0">
          {[
            { m: "02", t: "Dashboard", d: "See exactly what this school gets" },
            { m: "05", t: "Calendar", d: "Grade 3 · Wed PT · Period 1 class teacher" },
            { m: "08", t: "Teachers", d: "Class teachers + specialists" },
            { m: "12", t: "Substitutions", d: "Absent → assigned cover" },
            { m: "15", t: "Next step", d: "Your school login + real teachers" },
          ].map((s) => (
            <li key={s.m} className="relative flex gap-4 border-b border-[#12261f]/8 py-3 pl-4">
              <span className="display w-8 shrink-0 text-lg text-[#0f6b5c]">{s.m}</span>
              <div>
                <p className="text-sm font-semibold">{s.t}</p>
                <p className="text-[11px] text-[#3d524c]">{s.d}</p>
              </div>
            </li>
          ))}
        </ol>

        {/* Pitch box */}
        <div className="mt-6 rounded-xl bg-[#12261f] p-5 text-[#eef3f1]">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7dcaa0]">
            One-line pitch
          </p>
          <p className="display mt-2 text-lg leading-snug">
            “One calm screen for timetable and cover — so every class has a teacher and a plan.”
          </p>
        </div>

        {/* Login box — brochure style */}
        <div className="mt-4 rounded-xl border-2 border-dashed border-[#0f6b5c]/40 bg-[#e8f5f0] p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0f6b5c]">
            Trial login
          </p>
          <p className="mt-2 font-mono text-sm text-[#12261f]">
            pilot@client.school
          </p>
          <p className="font-mono text-sm text-[#12261f]">ClientPilot2026</p>
          <p className="mt-2 text-[11px] text-[#3d524c]">
            Role: School Admin · Teacher demo: megha.lohade@client.school / teacher123
          </p>
        </div>

        <div className="mt-auto flex items-end justify-between gap-4 border-t border-[#12261f]/10 pt-6">
          <div>
            <p className="display text-xl text-[#0f6b5c]">AI Smart Calendar</p>
            <p className="text-[11px] text-[#3d524c]">
              Timetable · Substitutions · Lesson cover
            </p>
          </div>
          <div className="text-right text-[10px] uppercase tracking-wide text-[#12261f]/45">
            <p>Ask for your</p>
            <p className="font-semibold text-[#0f6b5c]">school credentials</p>
          </div>
        </div>
      </article>
    </div>
  );
}
