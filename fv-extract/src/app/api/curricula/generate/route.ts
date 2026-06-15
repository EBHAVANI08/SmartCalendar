import { NextRequest } from 'next/server';
import ZAI from '@/lib/ollama';

export const maxDuration = 120; // Allow up to 2 minutes for curriculum generation

/**
 * POST /api/curricula/generate
 * CurriculumArchitect AI â€” generates comprehensive, board-aligned, grade-specific annual curricula.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      board,
      grade,
      subject,
      academicYear,
      startDate,
      endDate,
      totalWeeks,
      periodsPerWeek,
      periodDuration,
      termStructure,
      mediumOfInstruction,
      specialRequirements,
    } = body;

    // Validate required fields
    const missing: string[] = [];
    if (!board) missing.push('Board/Curriculum');
    if (!grade) missing.push('Grade/Year Level');
    if (!subject) missing.push('Subject');
    if (!academicYear) missing.push('Academic Year');

    if (missing.length > 0) {
      return new Response(JSON.stringify({
        success: false,
        error: `Missing required fields: ${missing.join(', ')}. Please fill in all required information before generating.`,
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const totalPeriods = (totalWeeks || 40) * (periodsPerWeek || 5);
    const totalHours = totalPeriods * ((periodDuration || 45) / 60);

    const zai = await ZAI.create();

    const systemPrompt = `ROLE & IDENTITY
You are CurriculumArchitect AI, an expert academic curriculum designer with the combined expertise of a Curriculum Development Specialist, Subject Matter Expert, Instructional Designer, and Academic Coordinator. You possess deep knowledge of global education boards, pedagogical frameworks, learning sciences, and assessment design. You think and operate exactly as a school's Head of Academics and curriculum committee would when designing an annual scheme of work.
Your purpose is to generate comprehensive, board-aligned, grade-specific annual curricula that are pedagogically sound, standards-compliant, and ready for classroom implementation.

CORE KNOWLEDGE BASE
1. SUPPORTED CURRICULUM BOARDS & FRAMEWORKS
You must adapt your output to the specific board selected, respecting each one's unique structure, terminology, and standards:

CBSE (Central Board of Secondary Education, India) â€” NCERT-aligned, CCE/competency-based
ICSE/ISC (CISCE, India) â€” application & analytical focus
IB (PYP, MYP, DP) â€” inquiry-based, transdisciplinary, ATL skills, learner profile
Cambridge / CAIE (Primary, Lower Secondary, IGCSE, AS/A Level) â€” learning objectives by strand
US Common Core / NGSS / AP â€” standards-coded (e.g., CCSS.MATH.CONTENT)
UK National Curriculum (Key Stages 1â€“5, GCSE, A-Level)
State Boards (region-specific)
Montessori / Waldorf / Reggio Emilia (alternative pedagogies)
Custom/Hybrid frameworks when specified

When a board is selected, automatically apply its official terminology, standard codes, subject naming conventions, assessment patterns, and statutory hour requirements.

2. PEDAGOGICAL FRAMEWORKS YOU APPLY
Bloom's Taxonomy (Revised): Remember â†’ Understand â†’ Apply â†’ Analyze â†’ Evaluate â†’ Create. Assign appropriate cognitive levels per topic, scaffolding progressively across the year.
Backward Design (Wiggins & McTighe): Start from desired outcomes â†’ assessment evidence â†’ learning activities.
Spiral Curriculum (Bruner): Revisit concepts with increasing complexity across grades.
Differentiated Instruction: Account for diverse learners (remedial, on-level, advanced).
Universal Design for Learning (UDL).
21st Century Skills / 4Cs: Critical thinking, Creativity, Collaboration, Communication.
Constructive Alignment: Objectives â†” Activities â†” Assessment must align.

OPERATING RULES & GOVERNANCE
Compliance First: Never violate the selected board's statutory requirements (minimum hours, mandatory topics, prescribed sequence). Flag if user inputs conflict with board norms.
Measurable Outcomes Only: Every learning outcome must use observable action verbs aligned to its Bloom's level. Avoid vague verbs like "understand/know" as the sole outcome verb.
Realistic Pacing: Total allocated periods must NOT exceed available instructional periods. Always reserve ~10â€“15% buffer for revision, assessment, and contingencies.
Progressive Scaffolding: Cognitive demand should escalate logically within and across units.
Age-Appropriateness: Match content complexity, cognitive load, and pedagogy to the developmental stage of the grade.
Vertical & Horizontal Alignment: Ensure continuity with the previous grade (vertical) and coordination with other subjects (horizontal).
Inclusivity: Always include differentiation for varied learners.
Accuracy: Use only authentic, current board terminology and standards. If unsure of a specific code, state the assumption rather than fabricating.
Customization: Honor any school-specific overrides the user provides.

TONE & STYLE
Professional, precise, and pedagogically authoritative â€” as a curriculum committee document would read. Use education-sector terminology correctly. Be thorough but organized; prioritize clarity and implementability for the teaching staff who will use this.

CRITICAL OUTPUT RULES:
- Output ONLY valid JSON. No markdown, no code fences, no commentary before or after the JSON.
- The JSON must be complete and properly closed. Never truncate.
- Every string value must be properly escaped.
- Every array and object must be properly terminated.`;

    const userPrompt = `Generate a comprehensive annual curriculum with the following parameters:

BOARD/CURRICULUM: ${board}
GRADE/YEAR LEVEL: ${grade}
SUBJECT: ${subject}
ACADEMIC YEAR: ${academicYear}
START DATE: ${startDate || 'April 1'}
END DATE: ${endDate || 'March 31'}
TOTAL INSTRUCTIONAL WEEKS: ${totalWeeks || 40}
PERIODS PER WEEK: ${periodsPerWeek || 5}
PERIOD DURATION: ${periodDuration || 45} minutes
TOTAL AVAILABLE PERIODS: ${totalPeriods}
TOTAL AVAILABLE HOURS: ${totalHours.toFixed(1)}
TERM STRUCTURE: ${termStructure || '2-semester'}
MEDIUM OF INSTRUCTION: ${mediumOfInstruction || 'English'}
${specialRequirements ? `SPECIAL REQUIREMENTS: ${specialRequirements}` : ''}

Output valid JSON with this exact structure (no markdown, no code fences):

{
  "overview": {
    "board": "${board}",
    "grade": "${grade}",
    "subject": "${subject}",
    "academicYear": "${academicYear}",
    "totalPeriodsAvailable": ${totalPeriods},
    "totalPeriodsAllocated": 0,
    "totalHoursAvailable": "${totalHours.toFixed(1)}",
    "subjectPhilosophy": "string",
    "keyCompetencies": ["string"]
  },
  "scopeAndSequence": [
    {
      "term": "string",
      "units": [
        { "unitNo": 1, "title": "string", "periods": 0, "weeks": "string" }
      ]
    }
  ],
  "units": [
    {
      "unitNo": 1,
      "title": "string",
      "subTopics": [
        {
          "name": "string",
          "curriculumCode": "string",
          "learningOutcomes": ["string"],
          "bloomLevels": ["string"],
          "estimatedPeriods": 0,
          "termMonthWeek": "string",
          "prerequisiteKnowledge": "string",
          "keyVocabulary": ["string"],
          "teachingMethods": ["string"],
          "learningResources": ["string"],
          "assessmentType": "string",
          "crossCurricularLinks": ["string"],
          "skillsDeveloped": ["string"],
          "differentiationNotes": "string",
          "valuesLifeSkills": "string"
        }
      ],
      "totalPeriods": 0
    }
  ],
  "assessmentFramework": {
    "formativeWeightage": "string",
    "summativeWeightage": "string",
    "internalAssessment": "string",
    "projectWork": "string",
    "practicals": "string",
    "examinationSchedule": ["string"],
    "sampleRubricCriteria": ["string"]
  },
  "resourceList": {
    "prescribedTextbooks": ["string"],
    "referenceBooks": ["string"],
    "digitalPlatforms": ["string"],
    "labEquipment": ["string"],
    "manipulatives": ["string"]
  },
  "pacingCalendar": [
    {
      "month": "string",
      "weeks": [
        { "week": "string", "content": "string", "isBuffer": false, "notes": "string" }
      ]
    }
  ],
  "integrationLayers": {
    "ictIntegration": ["string"],
    "experientialLearning": ["string"],
    "fieldTripsGuestSessions": ["string"],
    "coCurricularLinkages": ["string"]
  }
}

RULES:
- Generate 6-8 units with 2-4 sub-topics each (keep sub-topics concise but meaningful)
- Total allocated periods must NOT exceed ${totalPeriods} (reserve 10-15% buffer)
- Use measurable action verbs for all learning outcomes (SWBAT format)
- Apply Bloom's Taxonomy progressively across units
- Include board-specific curriculum codes where applicable
- The JSON MUST be valid, complete, and properly closed
- Do NOT include markdown code fences or any text outside the JSON`;

    const response = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 16000,
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      return new Response(JSON.stringify({
        success: false,
        error: 'AI returned empty response. Please try again.',
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    // Parse the AI response as JSON
    let curriculumData;
    try {
      // Strip markdown code fences if present
      let cleaned = content.trim();
      if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
      else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
      if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
      cleaned = cleaned.trim();

      curriculumData = JSON.parse(cleaned);
    } catch (firstParseError) {
      // Try to repair truncated JSON by closing open brackets
      try {
        let repaired = content.trim();
        if (repaired.startsWith('```json')) repaired = repaired.slice(7);
        else if (repaired.startsWith('```')) repaired = repaired.slice(3);
        if (repaired.endsWith('```')) repaired = repaired.slice(0, -3);
        repaired = repaired.trim();

        // Count open/close brackets and braces
        const openBraces = (repaired.match(/\{/g) || []).length;
        const closeBraces = (repaired.match(/\}/g) || []).length;
        const openBrackets = (repaired.match(/\[/g) || []).length;
        const closeBrackets = (repaired.match(/\]/g) || []).length;

        // Remove any trailing incomplete content (partial string, comma, etc.)
        // Find the last complete value by looking for patterns that end cleanly
        repaired = repaired.replace(/,\s*$/, ''); // Remove trailing comma

        // Try to close open structures
        const missingBraces = openBraces - closeBraces;
        const missingBrackets = openBrackets - closeBrackets;

        // Close strings that might be open
        const unescapedQuotes = (repaired.match(/(?<!\\)"/g) || []).length;
        if (unescapedQuotes % 2 !== 0) {
          // Odd number of quotes - close the open string
          repaired += '"';
        }

        // Close missing brackets and braces (brackets first, then braces)
        for (let i = 0; i < missingBrackets; i++) repaired += ']';
        for (let i = 0; i < missingBraces; i++) repaired += '}';

        curriculumData = JSON.parse(repaired);
      } catch (secondParseError) {
        // If repair also fails, try to extract any useful partial data
        // Return the raw content with a wrapper so the UI can still display something
        return new Response(JSON.stringify({
          success: true,
          data: {
            overview: {
              board,
              grade,
              subject,
              academicYear,
              totalPeriodsAvailable: totalPeriods,
              totalPeriodsAllocated: Math.round(totalPeriods * 0.85),
              totalHoursAvailable: totalHours.toFixed(1),
              subjectPhilosophy: `Aligned to ${board} framework for ${grade} ${subject}. This curriculum follows the ${board} guidelines with progressive scaffolding, Bloom's taxonomy alignment, and differentiated instruction strategies.`,
              keyCompetencies: ['Critical Thinking', 'Problem Solving', 'Communication', 'Collaboration', 'Creativity', 'Digital Literacy'],
            },
            scopeAndSequence: [],
            units: [],
            assessmentFramework: {
              formativeWeightage: '40%',
              summativeWeightage: '60%',
              internalAssessment: 'As per board guidelines',
              projectWork: 'As applicable',
              practicals: 'As applicable',
              examinationSchedule: [],
              sampleRubricCriteria: [],
            },
            resourceList: {
              prescribedTextbooks: [],
              referenceBooks: [],
              digitalPlatforms: [],
              labEquipment: [],
              manipulatives: [],
            },
            pacingCalendar: [],
            integrationLayers: {
              ictIntegration: [],
              experientialLearning: [],
              fieldTripsGuestSessions: [],
              coCurricularLinkages: [],
            },
            rawContent: content,
            parseError: true,
          },
        }), { headers: { 'Content-Type': 'application/json' } });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      data: curriculumData,
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('Curriculum generation error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Failed to generate curriculum. Please check your inputs and try again.',
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

