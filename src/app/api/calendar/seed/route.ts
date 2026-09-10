export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/authz';

interface StandardEventDef {
  title: string;
  category: 'holiday' | 'exam' | 'event' | 'ptm' | 'workshop';
  startDate: string; // YYYY-MM-DD
  endDate?: string;  // YYYY-MM-DD
  allDay?: boolean;
  time?: string;
  description?: string;
  location?: string;
}

/**
 * Standard CBSE / National Academic Calendar Events & Milestones
 * Configured across the 2026-2027 Academic Session (covering April 2026 to March 2027).
 */
const STANDARD_ACADEMIC_MILESTONES: StandardEventDef[] = [
  // April 2026
  {
    title: 'New Academic Session Commences (2026–27)',
    category: 'event',
    startDate: '2026-04-01',
    allDay: true,
    description: 'Welcome assembly, orientation for all classes, and syllabus distribution.',
    location: 'Main School Auditorium & Classrooms',
  },
  {
    title: 'Good Friday (Public Holiday)',
    category: 'holiday',
    startDate: '2026-04-03',
    allDay: true,
    description: 'School closed on account of Good Friday.',
  },
  {
    title: 'Dr. B.R. Ambedkar Jayanti',
    category: 'holiday',
    startDate: '2026-04-14',
    allDay: true,
    description: 'National holiday observing Dr. B.R. Ambedkar Jayanti.',
  },
  {
    title: 'World Earth Day & Green Campus Drive',
    category: 'event',
    startDate: '2026-04-22',
    allDay: false,
    time: '09:00 - 12:30',
    description: 'Tree plantation drive, poster making competition, and eco-pledge.',
    location: 'School Grounds',
  },

  // May 2026
  {
    title: 'Periodic Assessment 1 (Grades 1 to 12)',
    category: 'exam',
    startDate: '2026-05-04',
    endDate: '2026-05-09',
    allDay: true,
    description: 'First cycle unit assessments across all curriculum subjects.',
    location: 'Designated Examination Halls',
  },
  {
    title: 'Term 1 Parent-Teacher Meeting (PTM 1)',
    category: 'ptm',
    startDate: '2026-05-16',
    allDay: false,
    time: '08:30 - 13:00',
    description: 'Discussion of Periodic Assessment 1 performance and student progress.',
    location: 'Respective Classrooms',
  },
  {
    title: 'Summer Vacation Begins',
    category: 'holiday',
    startDate: '2026-05-18',
    endDate: '2026-06-13',
    allDay: true,
    description: 'Annual summer break for students and teaching staff.',
  },

  // June 2026
  {
    title: 'School Reopens after Summer Vacation',
    category: 'event',
    startDate: '2026-06-15',
    allDay: true,
    description: 'Regular classes resume for all grades.',
  },
  {
    title: 'International Yoga Day & Wellness Workshop',
    category: 'event',
    startDate: '2026-06-21',
    allDay: false,
    time: '07:30 - 09:30',
    description: 'Mass yoga demonstration for students and staff with guided breathing techniques.',
    location: 'Open Air Amphitheatre',
  },
  {
    title: 'NEP 2020 Pedagogical Teacher Training Workshop',
    category: 'workshop',
    startDate: '2026-06-27',
    allDay: false,
    time: '09:30 - 15:30',
    description: 'Experiential learning, competency-based assessments and digital smart classroom pedagogy.',
    location: 'Conference Hall',
  },

  // July 2026
  {
    title: 'Student Council Investiture Ceremony',
    category: 'event',
    startDate: '2026-07-11',
    allDay: false,
    time: '09:00 - 12:00',
    description: 'Conferring badges and oaths to the newly elected Student Council Head Boy, Head Girl, and House Captains.',
    location: 'Main Auditorium',
  },
  {
    title: 'Muharram (Gazetted Holiday)',
    category: 'holiday',
    startDate: '2026-07-25',
    allDay: true,
    description: 'Public holiday on account of Muharram.',
  },

  // August 2026
  {
    title: 'Independence Day Celebrations & Flag Hoisting',
    category: 'event',
    startDate: '2026-08-15',
    allDay: false,
    time: '08:00 - 11:30',
    description: '79th Independence Day patriotic cultural performances, parade, and flag hoisting.',
    location: 'School Assembly Grounds',
  },
  {
    title: 'Raksha Bandhan (Holiday)',
    category: 'holiday',
    startDate: '2026-08-28',
    allDay: true,
    description: 'School holiday for Raksha Bandhan.',
  },

  // September 2026
  {
    title: 'Teachers Day Celebration',
    category: 'event',
    startDate: '2026-09-05',
    allDay: false,
    time: '10:00 - 13:00',
    description: 'Special student-led assembly and felicitation ceremony honoring school faculty.',
    location: 'School Auditorium',
  },
  {
    title: 'Janmashtami (Gazetted Holiday)',
    category: 'holiday',
    startDate: '2026-09-04',
    allDay: true,
    description: 'Holiday celebrating Shri Krishna Janmashtami.',
  },
  {
    title: 'Term 1 / Mid-Term Half-Yearly Examinations',
    category: 'exam',
    startDate: '2026-09-14',
    endDate: '2026-09-25',
    allDay: true,
    description: 'Formal Half-Yearly Examinations for Grades 1 to 12 across all core subjects.',
    location: 'All Classrooms & Examination Blocks',
  },
  {
    title: 'Mid-Term Report Card Parent-Teacher Meeting (PTM 2)',
    category: 'ptm',
    startDate: '2026-09-30',
    allDay: false,
    time: '08:30 - 14:00',
    description: 'One-on-one parent feedback, term 1 answer sheet distribution, and academic progress reports.',
    location: 'Respective Classrooms',
  },

  // October 2026
  {
    title: 'Mahatma Gandhi Jayanti (National Holiday)',
    category: 'holiday',
    startDate: '2026-10-02',
    allDay: true,
    description: 'National holiday observing the birth anniversary of Mahatma Gandhi.',
  },
  {
    title: 'Dussehra (Vijayadashami Break)',
    category: 'holiday',
    startDate: '2026-10-20',
    endDate: '2026-10-22',
    allDay: true,
    description: 'Autumn festive break on account of Durga Puja and Dussehra.',
  },
  {
    title: 'Inter-House Science & Robotics Exhibition',
    category: 'event',
    startDate: '2026-10-29',
    allDay: false,
    time: '09:00 - 14:00',
    description: 'Student exhibits, working models, AI projects, and scientific inventions.',
    location: 'STEM & Robotics Lab',
  },

  // November 2026
  {
    title: 'Diwali & Deepawali Festival Break',
    category: 'holiday',
    startDate: '2026-11-06',
    endDate: '2026-11-10',
    allDay: true,
    description: 'Festival of Lights holidays for staff and students.',
  },
  {
    title: 'Childrens Day Celebration & Fun Fair',
    category: 'event',
    startDate: '2026-11-14',
    allDay: false,
    time: '09:00 - 13:30',
    description: 'Games carnival, music, food stalls, and special performances dedicated to students.',
    location: 'School Playground & Quadrangle',
  },
  {
    title: 'Periodic Assessment 2 (Grades 1 to 12)',
    category: 'exam',
    startDate: '2026-11-23',
    endDate: '2026-11-28',
    allDay: true,
    description: 'Cycle 2 assessments for continuous term evaluation.',
    location: 'Examination Halls',
  },

  // December 2026
  {
    title: 'Annual Sports Day & Athletics Meet',
    category: 'event',
    startDate: '2026-12-12',
    allDay: false,
    time: '08:30 - 16:30',
    description: 'Track and field events, house march past, relay races, and medal distribution.',
    location: 'Main Sports Complex',
  },
  {
    title: 'Winter Break & Christmas Holidays',
    category: 'holiday',
    startDate: '2026-12-24',
    endDate: '2026-12-31',
    allDay: true,
    description: 'Winter break and Christmas vacation.',
  },

  // January 2027
  {
    title: 'School Reopens / New Year Academic Day',
    category: 'event',
    startDate: '2027-01-04',
    allDay: true,
    description: 'Classes resume for all grades.',
  },
  {
    title: 'Pre-Board Examinations 1 (Grades 10 & 12)',
    category: 'exam',
    startDate: '2027-01-08',
    endDate: '2027-01-19',
    allDay: true,
    description: 'Full syllabus mock board examinations prepared according to official board blueprint.',
    location: 'Senior Examination Wing',
  },
  {
    title: 'Makar Sankranti / Pongal (Holiday)',
    category: 'holiday',
    startDate: '2027-01-14',
    allDay: true,
    description: 'School holiday observing Makar Sankranti.',
  },
  {
    title: 'Republic Day Parade & Patriotic Gathering',
    category: 'event',
    startDate: '2027-01-26',
    allDay: false,
    time: '08:00 - 11:00',
    description: 'Republic Day celebrations with tricolor unfurling and patriotic songs.',
    location: 'School Grounds',
  },

  // February 2027
  {
    title: 'Pre-Board Examinations 2 & Remedial Classes',
    category: 'exam',
    startDate: '2027-02-03',
    endDate: '2027-02-13',
    allDay: true,
    description: 'Final preparatory exams and intensive doubt-clearing sessions.',
    location: 'Senior Wing',
  },
  {
    title: 'Maha Shivratri (Holiday)',
    category: 'holiday',
    startDate: '2027-02-15',
    allDay: true,
    description: 'Gazetted holiday for Maha Shivratri.',
  },
  {
    title: 'Annual Cultural Day & Prize Distribution Gala',
    category: 'event',
    startDate: '2027-02-27',
    allDay: false,
    time: '16:00 - 20:30',
    description: 'Grand annual drama, musical symphony, and academic/extracurricular felicitation.',
    location: 'Main Auditorium',
  },

  // March 2027
  {
    title: 'Holi (Festival of Colours Holiday)',
    category: 'holiday',
    startDate: '2027-03-03',
    allDay: true,
    description: 'School closed for Holi celebrations.',
  },
  {
    title: 'Annual Final Examinations (Grades 1 to 9 & 11)',
    category: 'exam',
    startDate: '2027-03-08',
    endDate: '2027-03-20',
    allDay: true,
    description: 'Session-ending cumulative examinations for all non-board grades.',
    location: 'All Classrooms',
  },
  {
    title: 'Final Report Card Distribution & Graduation PTM',
    category: 'ptm',
    startDate: '2027-03-28',
    allDay: false,
    time: '08:30 - 14:00',
    description: 'Annual result declaration, promotion cards, and textbook collection for the next session.',
    location: 'Respective Classrooms',
  },
];

export async function POST(request: Request) {
  const denied = requireCapability(request, 'calendar.write');
  if (denied) return denied;

  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const reset = url.searchParams.get('reset') === 'true';

  if (reset) {
    await db.calendarEvent.deleteMany({
      where: { schoolId, source: 'school' },
    });
  }

  // Count existing events
  const existingCount = await db.calendarEvent.count({
    where: { schoolId, source: 'school' },
  });

  if (existingCount > 0 && !reset) {
    return NextResponse.json({
      success: true,
      message: `School already has ${existingCount} calendar events configured. Send ?reset=true to re-populate standard milestones.`,
      count: existingCount,
    });
  }

  const createdEvents: any[] = [];

  for (const item of STANDARD_ACADEMIC_MILESTONES) {
    const isAllDay = item.allDay !== false;
    const startStr = `${item.startDate}T00:00:00.000Z`;
    const endStr = item.endDate
      ? `${item.endDate}T23:59:59.000Z`
      : `${item.startDate}T23:59:59.000Z`;

    const ev = await db.calendarEvent.create({
      data: {
        schoolId,
        title: item.title,
        category: item.category,
        description: item.description || null,
        roomId: item.location || null,
        source: 'school',
        status: 'published',
        allDay: isAllDay,
        startAt: new Date(startStr),
        endAt: new Date(endStr),
        createdBy: 'academic-director',
      },
    });

    createdEvents.push(ev);
  }

  return NextResponse.json({
    success: true,
    message: `Successfully loaded ${createdEvents.length} standard academic milestones & holidays into database.`,
    count: createdEvents.length,
  });
}
