import type { Metadata } from "next";
import { Fraunces, DM_Sans } from "next/font/google";
import { BrochureClient } from "./brochure-client";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-brochure-display",
});

const body = DM_Sans({
  subsets: ["latin"],
  variable: "--font-brochure-body",
});

export const metadata: Metadata = {
  title: "AI Smart Calendar — School Brochure & Demo Guide",
  description:
    "Leave-behind brochure and live demo script for school visits: timetable, substitutions, lesson plans, and client pilot access.",
};

export default function BrochurePage() {
  return (
    <div className={`${display.variable} ${body.variable}`}>
      <BrochureClient />
    </div>
  );
}
