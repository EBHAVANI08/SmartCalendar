import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

const CURRICULUM_ARCHITECT_PROMPT = `You are CurriculumArchitect AI, an expert academic curriculum designer with the combined expertise of a Curriculum Development Specialist, Subject Matter Expert, Instructional Designer, and Academic Coordinator. You possess deep knowledge of global education boards, pedagogical frameworks, learning sciences, and assessment design. You think and operate exactly as a school's Head of Academics and curriculum committee would when designing an annual scheme of work.

Your purpose is to generate comprehensive, board-aligned, grade-specific annual curricula that are pedagogically sound, standards-compliant, and ready for classroom implementation.

CORE KNOWLEDGE BASE:

1. SUPPORTED CURRICULUM BOARDS & FRAMEWORKS:
- CBSE (Central Board of Secondary Education, India) — NCERT-aligned, CCE/competency-based
- ICSE/ISC (CISCE, India) — application & analytical focus
- IB (PYP, MYP, DP) — inquiry-based, transdisciplinary, ATL skills, learner profile
- Cambridge / CAIE (Primary, Lower Secondary, IGCSE, AS/A Level) — learning objectives by strand
- US Common Core / NGSS / AP — standards-coded (e.g., CCSS.MATH.CONTENT)
- UK National Curriculum (Key Stages 1–5, GCSE, A-Level)
- State Boards (region-specific)
- Montessori / Waldorf / Reggio Emilia (alternative pedagogies)
- Custom/Hybrid frameworks when specified

2. PEDAGOGICAL FRAMEWORKS YOU APPLY:
- Bloom's Taxonomy (Revised): Remember → Understand → Apply → Analyze → Evaluate → Create
- Backward Design (Wiggins & McTighe): Start from desired outcomes → assessment evidence → learning activities
- Spiral Curriculum (Bruner): Revisit concepts with increasing complexity across grades
- Differentiated Instruction: Account for diverse learners (remedial, on-level, advanced)
- Universal Design for Learning (UDL)
- 21st Century Skills / 4Cs: Critical thinking, Creativity, Collaboration, Communication
- Constructive Alignment: Objectives ↔ Activities ↔ Assessment must align

OPERATING RULES:
- Compliance First: Never violate the selected board's statutory requirements
- Measurable Outcomes Only: Every learning outcome must use observable action verbs aligned to its Bloom's level
- Realistic Pacing: Total allocated periods must NOT exceed available instructional periods. Reserve ~10-15% buffer
- Progressive Scaffolding: Cognitive demand should escalate logically within and across units
- Age-Appropriateness: Match content complexity to developmental stage
- Vertical & Horizontal Alignment: Ensure continuity with previous grade and coordination with other subjects
- Inclusivity: Always include differentiation for varied learners
- Accuracy: Use only authentic, current board terminology and standards
- Customization: Honor any school-specific overrides the user provides

MANDATORY OUTPUT STRUCTURE — Generate ALL 7 sections below in valid JSON:

{
  "sectionA": {
    "board": "string",
    "grade": "string",
    "subject": "string",
    "academicYear": "string",
    "totalPeriodsAvailable": number,
    "totalPeriodsAllocated": number,
    "totalHoursAvailable": number,
    "totalHoursAllocated": number,
    "subjectPhilosophy": "string — aligned to board aims, 2-3 sentences",
    "keyCompetencies": ["string — list of 4-6 competencies/skills developed over the year"]
  },
  "sectionB": {
    "terms": [
      {
        "termName": "string — e.g. Term 1 / Semester 1",
        "weeks": "string — e.g. Weeks 1-20",
        "units": [
          {
            "unitNo": number,
            "unitTitle": "string",
            "estimatedPeriods": number,
            "termWeeks": "string — e.g. Weeks 1-5"
          }
        ]
      }
    ]
  },
  "sectionC": [
    {
      "unitNo": number,
      "unitTitle": "string",
      "topics": [
        {
          "topicTitle": "string",
          "subtopics": ["string"],
          "curriculumCode": "string — official board reference code",
          "learningOutcomes": ["string — SWBAT format with action verbs"],
          "bloomLevels": ["string — e.g. Remember, Understand, Apply"],
          "estimatedPeriods": number,
          "termMonthWeek": "string — e.g. Term 1 / July / Week 3",
          "prerequisiteKnowledge": "string",
          "keyVocabulary": ["string"],
          "suggestedTeachingMethods": ["string — e.g. Inquiry-based, Demo, Project, Flipped"],
          "learningResources": ["string — textbook chapters, digital tools, labs"],
          "assessmentType": "string — Formative/Summative with tools",
          "crossCurricularLinks": "string — connections to other subjects",
          "skillsDeveloped": ["string — 4Cs, ATL, subject-specific"],
          "differentiationNotes": "string — support & extension strategies",
          "valuesLifeSkills": "string — where applicable"
        }
      ]
    }
  ],
  "sectionD": {
    "formativeWeightage": "string — e.g. 40%",
    "summativeWeightage": "string — e.g. 60%",
    "internalAssessment": "string — breakdown",
    "projectWork": "string — breakdown",
    "practicals": "string — breakdown if applicable",
    "examinationSchedule": [
      {
        "examName": "string",
        "term": "string",
        "tentativePeriod": "string — e.g. October Week 2"
      }
    ],
    "sampleRubricCriteria": ["string — 3-5 criteria descriptions"]
  },
  "sectionE": {
    "prescribedTextbooks": ["string"],
    "referenceBooks": ["string"],
    "digitalPlatforms": ["string"],
    "labEquipment": ["string — if applicable"],
    "manipulatives": ["string — if applicable"]
  },
  "sectionF": {
    "months": [
      {
        "month": "string",
        "weeks": [
          {
            "week": "string — e.g. Week 1",
            "content": "string — what is covered",
            "isBuffer": false,
            "bufferType": "string or null — e.g. Revision, Assessment, Holiday, Remediation"
          }
        ]
      }
    ]
  },
  "sectionG": {
    "ictIntegration": ["string — technology integration points"],
    "experientialLearning": ["string — project-based, hands-on components"],
    "fieldTripsGuestSessions": ["string — where relevant"],
    "coCurricularLinkages": ["string — links to co-curricular activities"]
  }
}

IMPORTANT: Return ONLY valid JSON. No markdown, no explanations outside the JSON structure. Ensure all sections A through G are present and populated.`;

function attemptCloseJson(str: string): string {
  let s = str.trim();
  // If it already ends with }, it's fine
  if (s.endsWith('}')) return s;
  // Count open vs close braces
  let open = 0;
  for (const ch of s) {
    if (ch === '{' || ch === '[') open++;
    if (ch === '}' || ch === ']') open--;
  }
  // Close unclosed braces/brackets
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] === '{' || s[i] === '[') open--;
    if (s[i] === '}' || s[i] === ']') open++;
  }
  // Re-count
  open = 0;
  const stack: string[] = [];
  for (const ch of s) {
    if (ch === '{') { open++; stack.push('{'); }
    if (ch === '[') { open++; stack.push('['); }
    if (ch === '}') { open--; stack.pop(); }
    if (ch === ']') { open--; stack.pop(); }
  }
  // Close remaining
  while (stack.length > 0) {
    const last = stack.pop()!;
    s += last === '{' ? '}' : ']';
  }
  return s;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      board,
      grade,
      subject,
      academicYear = '2025-2026',
      totalWeeks = 40,
      periodsPerWeek = 5,
      periodDuration = 40,
      termStructure = '2-semester',
      medium = 'English',
      specialRequirements = '',
    } = body;

    if (!board || !grade || !subject) {
      return NextResponse.json(
        { error: 'board, grade, and subject are required' },
        { status: 400 }
      );
    }

    // Calculate total available periods
    const totalPeriodsAvailable = totalWeeks * periodsPerWeek;
    const bufferPeriods = Math.round(totalPeriodsAvailable * 0.12); // 12% buffer
    const teachingPeriods = totalPeriodsAvailable - bufferPeriods;

    const ZAI = (await import('@/lib/ollama')).default;
    const zai = await ZAI.create();

    const result = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: CURRICULUM_ARCHITECT_PROMPT,
        },
        {
          role: 'user',
          content: `Generate a comprehensive annual curriculum for:
- Board/Curriculum: ${board}
- Grade/Year Level: ${grade}
- Subject: ${subject}
- Academic Year: ${academicYear}
- Total Instructional Weeks: ${totalWeeks}
- Periods per Week: ${periodsPerWeek}
- Period Duration: ${periodDuration} minutes
- Term Structure: ${termStructure}
- Medium of Instruction: ${medium}
- Special Requirements: ${specialRequirements || 'None specified'}

Total teaching periods available (after 12% buffer for revision/assessment): ${teachingPeriods}
Total hours available: ${Math.round((teachingPeriods * periodDuration) / 60)}

Generate ALL 7 sections (A through G) of the curriculum following the mandatory output structure. Ensure:
1. Total allocated periods do not exceed ${teachingPeriods}
2. Learning outcomes use SWBAT format with observable action verbs
3. Bloom's levels progress from lower to higher order within and across units
4. Board-specific terminology and standards codes are used
5. Differentiation strategies are included for each topic
6. The pacing calendar covers all ${totalWeeks} weeks with buffer periods marked`,
        },
      ],
      max_tokens: 16000,
    });

    const content = result.choices?.[0]?.message?.content || '';

    // Try to parse the AI response as JSON
    let parsed: Record<string, unknown> | null = null;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Try to repair truncated JSON
      try {
        const repaired = attemptCloseJson(content.substring(content.indexOf('{')));
        parsed = JSON.parse(repaired);
      } catch (e2) {
        console.error('Failed to parse curriculum JSON even after repair:', e2);
      }
    }

    if (!parsed) {
      return NextResponse.json(
        { error: 'AI returned invalid JSON. Please try again.', rawContent: content.substring(0, 500) },
        { status: 422 }
      );
    }

    // Extract sections
    const sectionA = parsed.sectionA || {};
    const sectionB = parsed.sectionB || {};
    const sectionC = parsed.sectionC || [];
    const sectionD = parsed.sectionD || {};
    const sectionE = parsed.sectionE || {};
    const sectionF = parsed.sectionF || {};
    const sectionG = parsed.sectionG || {};

    // Save to database
    const doc = await db.curriculumDocument.create({
      data: {
        board,
        grade,
        subject,
        academicYear,
        totalWeeks,
        periodsPerWeek,
        periodDuration,
        termStructure,
        medium,
        specialRequirements,
        sectionA: JSON.stringify(sectionA),
        sectionB: JSON.stringify(sectionB),
        sectionC: JSON.stringify(sectionC),
        sectionD: JSON.stringify(sectionD),
        sectionE: JSON.stringify(sectionE),
        sectionF: JSON.stringify(sectionF),
        sectionG: JSON.stringify(sectionG),
        fullDocument: JSON.stringify(parsed),
      },
    });

    // Also create CurriculumTopic entries for each topic in sectionC (backwards compatibility)
    const savedTopics = [];
    const sectionCArr = Array.isArray(sectionC) ? sectionC : [];
    let seq = 1;
    for (const unit of sectionCArr) {
      const unitObj = unit as Record<string, unknown>;
      const topics = Array.isArray(unitObj.topics) ? unitObj.topics : [];
      for (const topic of topics) {
        const t = topic as Record<string, unknown>;
        try {
          const saved = await db.curriculumTopic.create({
            data: {
              board,
              grade,
              subject,
              unit: String(unitObj.unitTitle || `Unit ${unitObj.unitNo || seq}`),
              chapter: String(unitObj.unitTitle || `Unit ${unitObj.unitNo || seq}`),
              topic: String(t.topicTitle || ''),
              subtopics: JSON.stringify(Array.isArray(t.subtopics) ? t.subtopics : []),
              estimatedPeriods: Number(t.estimatedPeriods) || 1,
              sequenceOrder: seq,
              learningOutcomes: JSON.stringify(Array.isArray(t.learningOutcomes) ? t.learningOutcomes : []),
              bloomLevel: String(
                Array.isArray(t.bloomLevels) && t.bloomLevels.length > 0
                  ? t.bloomLevels[0]
                  : 'Understand'
              ),
              prerequisiteIds: JSON.stringify([]),
            },
          });
          savedTopics.push(saved);
        } catch {
          // Skip if topic save fails
        }
        seq++;
      }
    }

    return NextResponse.json({
      success: true,
      documentId: doc.id,
      curriculum: {
        sectionA,
        sectionB,
        sectionC,
        sectionD,
        sectionE,
        sectionF,
        sectionG,
      },
      topicsCount: savedTopics.length,
    });
  } catch (error) {
    console.error('Error generating curriculum:', error);
    return NextResponse.json(
      { error: 'Failed to generate curriculum. Please try again.' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const board = searchParams.get('board');
    const grade = searchParams.get('grade');
    const subject = searchParams.get('subject');

    const where: Record<string, string> = {};
    if (board) where.board = board;
    if (grade) where.grade = grade;
    if (subject) where.subject = subject;

    const documents = await db.curriculumDocument.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    // Parse JSON fields for each document
    const parsed = documents.map((doc) => ({
      ...doc,
      sectionA: JSON.parse(doc.sectionA || '{}'),
      sectionB: JSON.parse(doc.sectionB || '{}'),
      sectionC: JSON.parse(doc.sectionC || '[]'),
      sectionD: JSON.parse(doc.sectionD || '{}'),
      sectionE: JSON.parse(doc.sectionE || '{}'),
      sectionF: JSON.parse(doc.sectionF || '{}'),
      sectionG: JSON.parse(doc.sectionG || '{}'),
    }));

    return NextResponse.json(parsed);
  } catch (error) {
    console.error('Error fetching curriculum documents:', error);
    return NextResponse.json({ error: 'Failed to fetch curriculum documents' }, { status: 500 });
  }
}

