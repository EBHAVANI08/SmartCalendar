import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const HARDCODED_CURRICULUMS = [
  {
    name: 'International Baccalaureate (IB)',
    code: 'IB',
    description: 'The International Baccalaureate offers a continuum of international education through four high-quality programmes that encourage students across the world to become active, compassionate, and lifelong learners.',
    country: 'International',
    framework: 'IB Framework - Inquiry-based, transdisciplinary learning with emphasis on critical thinking and global mindedness',
    subjectAreas: ['Language & Literature', 'Language Acquisition', 'Individuals & Societies', 'Sciences', 'Mathematics', 'The Arts', 'Physical & Health Education', 'Design', 'Theory of Knowledge', 'Extended Essay', 'Creativity Activity Service'],
  },
  {
    name: 'Cambridge International',
    code: 'CAMBRIDGE',
    description: 'Cambridge Assessment International Education prepares school students for life, helping them develop an informed curiosity and a lasting passion for learning. Cambridge programmes set the global standard for international education.',
    country: 'United Kingdom',
    framework: 'Cambridge Pathway - Cambridge Primary, Lower Secondary, Upper Secondary (IGCSE), and Advanced (A-Level) with structured assessment milestones',
    subjectAreas: ['English', 'Mathematics', 'Science', 'ICT', 'Global Perspectives', 'Art & Design', 'Music', 'Physical Education', 'History', 'Geography', 'Foreign Languages', 'Business Studies', 'Economics'],
  },
  {
    name: 'American Curriculum',
    code: 'AMERICAN',
    description: 'The American curriculum emphasizes a broad, liberal arts education with flexibility in course selection. It follows Common Core State Standards and prepares students for Advanced Placement (AP) examinations and SAT/ACT college entrance tests.',
    country: 'United States',
    framework: 'Common Core State Standards (CCSS) with AP course options - standards-based progression with emphasis on critical analysis and creative thinking',
    subjectAreas: ['English Language Arts', 'Mathematics', 'Science', 'Social Studies', 'Physical Education', 'Fine Arts', 'World Languages', 'Technology', 'Health Education', 'AP Courses', 'Electives'],
  },
  {
    name: 'British National Curriculum',
    code: 'BRITISH',
    description: 'The British National Curriculum provides a structured framework for education from Early Years through GCSE and A-Levels. It emphasizes subject-based learning with regular assessments at Key Stages.',
    country: 'United Kingdom',
    framework: 'Key Stage framework (KS1-KS5) leading to GCSE and A-Level qualifications - subject-specialist teaching with formal examination assessment',
    subjectAreas: ['English', 'Mathematics', 'Science', 'History', 'Geography', 'Art & Design', 'Music', 'Physical Education', 'Computing', 'Design & Technology', 'Modern Foreign Languages', 'PSHE', 'Citizenship'],
  },
  {
    name: 'French Curriculum',
    code: 'FRENCH',
    description: 'The French curriculum follows the programmes of the French Ministry of Education. It provides a rigorous, structured approach to learning with strong emphasis on academic excellence, critical reasoning, and cultural knowledge.',
    country: 'France',
    framework: 'French National Education programmes - cycle-based progression (Cycle 2-4) leading to Brevet and Baccalauréat examinations with philosophical emphasis',
    subjectAreas: ['Français', 'Mathématiques', 'Histoire-Géographie', 'Sciences de la Vie et de la Terre', 'Physique-Chimie', 'Langues Vivantes', 'Éducation Physique et Sportive', 'Arts Plastiques', 'Musique', 'Technologie', 'Éducation Civique', 'Philosophie'],
  },
  {
    name: 'CBSE (Central Board of Secondary Education)',
    code: 'CBSE',
    description: 'CBSE is one of the most recognized boards of education in India, providing a standardized curriculum across the country with emphasis on science, mathematics, and holistic development through continuous and comprehensive evaluation.',
    country: 'India',
    framework: 'National Curriculum Framework (NCF) by NCERT - structured with continuous comprehensive evaluation (CCE) leading to AISSE (Class 10) and AISSCE (Class 12) board examinations',
    subjectAreas: ['Mathematics', 'Science', 'Social Science', 'English', 'Hindi', 'Sanskrit', 'Information Technology', 'Physical Education', 'Art', 'Music', 'Work Experience', 'General Knowledge'],
  },
  {
    name: 'Australian Curriculum',
    code: 'AUSTRALIAN',
    description: 'The Australian Curriculum sets consistent national standards to improve learning outcomes for all young Australians. It emphasizes general capabilities and cross-curriculum priorities alongside disciplinary knowledge.',
    country: 'Australia',
    framework: 'Australian Curriculum (ACARA) - achievement standards with general capabilities (literacy, numeracy, ICT, critical & creative thinking, ethical understanding, intercultural understanding, personal & social capability)',
    subjectAreas: ['English', 'Mathematics', 'Science', 'Humanities & Social Sciences', 'The Arts', 'Technologies', 'Health & Physical Education', 'Languages', 'Work Studies', 'Civics & Citizenship', 'Economics & Business', 'Geography', 'History'],
  },
];

export async function GET() {
  try {
    const curriculums = await db.curriculum.findMany({
      include: {
        subjects: {
          include: { subject: true },
          orderBy: { subject: { name: 'asc' } },
        },
      },
      orderBy: { name: 'asc' },
    });

    if (curriculums.length > 0) {
      const mapped = curriculums.map(c => ({
        id: c.id,
        name: c.name,
        code: c.code,
        description: c.description,
        country: c.country,
        framework: c.framework,
        isActive: c.isActive,
        subjectAreas: [...new Set(c.subjects.map(cs => cs.subject.name))],
        subjectCount: c.subjects.length,
        gradeLevels: [...new Set(c.subjects.map(cs => cs.gradeLevel))].sort((a, b) => a - b),
      }));
      return NextResponse.json({ success: true, data: mapped });
    }

    // No curriculums in DB yet — return hardcoded definitions
    const data = HARDCODED_CURRICULUMS.map(c => ({
      id: null,
      name: c.name,
      code: c.code,
      description: c.description,
      country: c.country,
      framework: c.framework,
      isActive: true,
      subjectAreas: c.subjectAreas,
      subjectCount: c.subjectAreas.length,
      gradeLevels: [],
    }));
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[CURRICULUM_LIST_GET_ERROR]', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch curriculums' },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code, name, description, country, framework } = body;

    if (!code || !name) {
      return NextResponse.json(
        { success: false, error: 'code and name are required' },
        { status: 400 },
      );
    }

    const existing = await db.curriculum.findUnique({ where: { code } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Curriculum with this code already exists' },
        { status: 409 },
      );
    }

    const curriculum = await db.curriculum.create({
      data: {
        name,
        code,
        description: description || '',
        country: country || null,
        framework: framework || null,
        isActive: true,
      },
    });

    return NextResponse.json({ success: true, data: curriculum }, { status: 201 });
  } catch (error) {
    console.error('[CURRICULUM_LIST_POST_ERROR]', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create curriculum' },
      { status: 500 },
    );
  }
}
