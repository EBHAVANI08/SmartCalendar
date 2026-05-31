import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

// CurriculumArchitect AI — Hybrid Generation Strategy
// 1. Instantly generate a comprehensive board-specific fallback curriculum
// 2. Use ONE focused AI call to enhance the unit topics with authentic board content
// 3. Always return success — never leave the user with nothing

function safeParseJSON(content: string): Record<string, unknown> | null {
  let cleaned = content.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  try {
    return JSON.parse(cleaned);
  } catch {}

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {}
  }

  // Repair truncated JSON
  try {
    let repaired = cleaned.replace(/,\s*$/, '');
    const unescapedQuotes = (repaired.match(/(?<!\\)"/g) || []).length;
    if (unescapedQuotes % 2 !== 0) repaired += '"';
    const openBraces = (repaired.match(/\{/g) || []).length;
    const closeBraces = (repaired.match(/\}/g) || []).length;
    const openBrackets = (repaired.match(/\[/g) || []).length;
    const closeBrackets = (repaired.match(/\]/g) || []).length;
    for (let i = 0; i < openBrackets - closeBrackets; i++) repaired += ']';
    for (let i = 0; i < openBraces - closeBraces; i++) repaired += '}';
    return JSON.parse(repaired);
  } catch {}

  return null;
}

// ── BOARD-SPECIFIC CURRICULUM KNOWLEDGE BASE ──
// This provides authentic, board-aligned content that serves as the foundation

interface UnitTemplate {
  title: string;
  topics: { name: string; subtopics: string[]; periods: number; bloom: string; outcomes: string[]; methods: string[]; resources: string[] }[];
}

const CURRICULUM_KNOWLEDGE: Record<string, Record<string, Record<string, UnitTemplate[]>>> = {
  CBSE: {
    'Grade 1': {
      Mathematics: [
        { title: 'Shapes and Space', topics: [
          { name: 'Identifying Shapes', subtopics: ['Circle', 'Square', 'Triangle', 'Rectangle'], periods: 3, bloom: 'Remember', outcomes: ['SWBAT identify and name basic shapes', 'SWBAT describe shapes by their properties'], methods: ['Hands-on sorting', 'Shape hunt activity'], resources: ['Shape cutouts', 'NCERT Math-Magic'] },
          { name: 'Spatial Understanding', subtopics: ['Inside/Outside', 'On/Under', 'Near/Far'], periods: 2, bloom: 'Understand', outcomes: ['SWBAT describe positions of objects'], methods: ['Activity-based', 'Story-based'], resources: ['NCERT Math-Magic Ch.1'] },
        ]},
        { title: 'Numbers 1-10', topics: [
          { name: 'Counting Objects', subtopics: ['One-to-one correspondence', 'Counting to 10', 'Number names'], periods: 4, bloom: 'Remember', outcomes: ['SWBAT count objects up to 10', 'SWBAT write number names'], methods: ['Counting rhymes', 'Object counting'], resources: ['Counters', 'Number cards'] },
          { name: 'Comparing Numbers', subtopics: ['More/Less', 'Greater/Smaller', 'Before/After'], periods: 3, bloom: 'Understand', outcomes: ['SWBAT compare numbers up to 10'], methods: ['Comparison activities', 'Number line'], resources: ['Number line chart'] },
        ]},
        { title: 'Addition and Subtraction', topics: [
          { name: 'Basic Addition', subtopics: ['Adding objects', 'Combining groups', 'Addition stories'], periods: 4, bloom: 'Apply', outcomes: ['SWBAT add numbers up to 10 using objects'], methods: ['Story problems', 'Manipulatives'], resources: ['Counters', 'Addition charts'] },
          { name: 'Basic Subtraction', subtopics: ['Taking away', 'Finding difference', 'Subtraction stories'], periods: 4, bloom: 'Apply', outcomes: ['SWBAT subtract numbers up to 10'], methods: ['Activity-based', 'Real-life scenarios'], resources: ['NCERT Math-Magic Ch.4-5'] },
        ]},
        { title: 'Numbers 11-50', topics: [
          { name: 'Tens and Ones', subtopics: ['Grouping in tens', 'Place value basics', 'Number names 11-50'], periods: 4, bloom: 'Understand', outcomes: ['SWBAT understand tens and ones concept'], methods: ['Bundle making', 'Abacus activity'], resources: ['Abacus', 'Bundles of sticks'] },
          { name: 'Number Patterns', subtopics: ['Skip counting', 'Even/Odd', 'Patterns in numbers'], periods: 3, bloom: 'Analyze', outcomes: ['SWBAT identify number patterns'], methods: ['Pattern blocks', 'Number games'], resources: ['Pattern cards'] },
        ]},
        { title: 'Measurement', topics: [
          { name: 'Length', subtopics: ['Long/Short', 'Tall/Short', 'Measuring with objects'], periods: 3, bloom: 'Apply', outcomes: ['SWBAT compare and measure lengths'], methods: ['Hands-on measurement', 'Comparison activity'], resources: ['Measuring strips'] },
          { name: 'Weight and Capacity', subtopics: ['Heavy/Light', 'More/Less capacity'], periods: 2, bloom: 'Understand', outcomes: ['SWBAT compare weights and capacities'], methods: ['Weighing activity', 'Pouring activity'], resources: ['Balance scale', 'Containers'] },
        ]},
        { title: 'Time and Money', topics: [
          { name: 'Reading Time', subtopics: ['Parts of the day', 'Reading clock hours', 'Calendar basics'], periods: 3, bloom: 'Apply', outcomes: ['SWBAT read time to the hour'], methods: ['Clock making', 'Daily routine chart'], resources: ['Toy clocks', 'Calendar'] },
          { name: 'Money', subtopics: ['Indian coins', 'Simple addition of money', 'Shopping activity'], periods: 2, bloom: 'Apply', outcomes: ['SWBAT identify Indian coins'], methods: ['Role play', 'Shopping game'], resources: ['Play money coins'] },
        ]},
      ],
      English: [
        { title: 'Phonics & Word Recognition', topics: [
          { name: 'Letter Sounds', subtopics: ['Consonants', 'Vowels', 'Blending sounds'], periods: 5, bloom: 'Remember', outcomes: ['SWBAT identify letter sounds', 'SWBAT blend sounds to form words'], methods: ['Phonics songs', 'Sound sorting'], resources: ['Phonics cards', 'Audio CD'] },
          { name: 'Sight Words', subtopics: ['Common sight words', 'Word recognition', 'Reading simple sentences'], periods: 4, bloom: 'Understand', outcomes: ['SWBAT read common sight words'], methods: ['Flash cards', 'Word wall'], resources: ['Sight word list', 'NCERT Marigold'] },
        ]},
        { title: 'Reading Comprehension', topics: [
          { name: 'Story Reading', subtopics: ['Picture reading', 'Simple stories', 'Answering questions'], periods: 4, bloom: 'Understand', outcomes: ['SWBAT read and understand simple stories'], methods: ['Read aloud', 'Story sequencing'], resources: ['NCERT Marigold stories'] },
          { name: 'Poetry & Rhymes', subtopics: ['Rhyming words', 'Recitation', 'Understanding meaning'], periods: 3, bloom: 'Remember', outcomes: ['SWBAT recite poems with expression'], methods: ['Choral reading', 'Action rhymes'], resources: ['NCERT Marigold poems'] },
        ]},
        { title: 'Writing Skills', topics: [
          { name: 'Letter Formation', subtopics: ['Capital letters', 'Small letters', 'Writing words'], periods: 4, bloom: 'Apply', outcomes: ['SWBAT write letters correctly'], methods: ['Tracing', 'Sand writing'], resources: ['Writing worksheets'] },
          { name: 'Simple Sentences', subtopics: ['Sentence structure', 'Punctuation basics', 'Writing about pictures'], periods: 3, bloom: 'Apply', outcomes: ['SWBAT write simple sentences'], methods: ['Picture prompts', 'Guided writing'], resources: ['Picture cards'] },
        ]},
      ],
    },
    'Grade 6': {
      Mathematics: [
        { title: 'Knowing Our Numbers', topics: [
          { name: 'Comparing Large Numbers', subtopics: ['Indian & International numeration', 'Place value to crores', 'Estimation & rounding off'], periods: 4, bloom: 'Understand', outcomes: ['SWBAT compare and order large numbers', 'SWBAT estimate quantities using rounding'], methods: ['Place value charts', 'Real-world examples'], resources: ['NCERT Textbook Ch.1', 'Place value chart'] },
          { name: 'Operations with Large Numbers', subtopics: ['Addition & subtraction', 'Multiplication & division', 'Brackets and BODMAS'], periods: 5, bloom: 'Apply', outcomes: ['SWBAT perform operations on large numbers using BODMAS'], methods: ['Problem solving', 'Mental math drills'], resources: ['NCERT Textbook Ch.1', 'Worksheet'] },
        ]},
        { title: 'Whole Numbers', topics: [
          { name: 'Properties of Whole Numbers', subtopics: ['Closure property', 'Commutative & associative', 'Distributive property'], periods: 4, bloom: 'Understand', outcomes: ['SWBAT state and apply properties of whole numbers'], methods: ['Discovery learning', 'Pattern observation'], resources: ['NCERT Ch.2', 'Number cards'] },
          { name: 'Number Line & Patterns', subtopics: ['Representing on number line', 'Number patterns', 'Triangles from numbers'], periods: 3, bloom: 'Analyze', outcomes: ['SWBAT represent operations on number line'], methods: ['Number line activity', 'Pattern worksheets'], resources: ['Number line chart'] },
        ]},
        { title: 'Playing with Numbers', topics: [
          { name: 'Factors and Multiples', subtopics: ['Factors & multiples', 'Prime & composite numbers', 'LCM & HCF'], periods: 5, bloom: 'Apply', outcomes: ['SWBAT find LCM and HCF of numbers', 'SWBAT identify prime and composite numbers'], methods: ['Factor tree method', 'Division method'], resources: ['NCERT Ch.3', 'Factor chart'] },
          { name: 'Divisibility Rules', subtopics: ['Rules for 2,3,4,5,6,8,9,10,11', 'Application problems'], periods: 3, bloom: 'Apply', outcomes: ['SWBAT apply divisibility rules to check divisibility'], methods: ['Rule practice', 'Number games'], resources: ['Divisibility rules chart'] },
        ]},
        { title: 'Basic Geometrical Ideas', topics: [
          { name: 'Points, Lines & Angles', subtopics: ['Point, line, ray', 'Types of angles', 'Angle measurement'], periods: 4, bloom: 'Understand', outcomes: ['SWBAT identify and measure different types of angles'], methods: ['Geoboard activity', 'Protractor practice'], resources: ['NCERT Ch.4', 'Protractor', 'Geoboard'] },
          { name: 'Triangles & Polygons', subtopics: ['Triangle classification', 'Polygon types', 'Properties'], periods: 4, bloom: 'Analyze', outcomes: ['SWBAT classify triangles and polygons by properties'], methods: ['Shape sorting', 'Construction activity'], resources: ['Ruler', 'Compass', 'Shape kits'] },
        ]},
        { title: 'Fractions & Decimals', topics: [
          { name: 'Fractions', subtopics: ['Types of fractions', 'Equivalent fractions', 'Comparing fractions', 'Addition & subtraction'], periods: 6, bloom: 'Apply', outcomes: ['SWBAT add, subtract, and compare fractions'], methods: ['Fraction strips', 'Visual models'], resources: ['NCERT Ch.7', 'Fraction strips'] },
          { name: 'Decimals', subtopics: ['Decimal representation', 'Converting fractions to decimals', 'Operations with decimals'], periods: 5, bloom: 'Apply', outcomes: ['SWBAT convert between fractions and decimals', 'SWBAT perform decimal operations'], methods: ['Place value chart', 'Real-world money problems'], resources: ['NCERT Ch.8', 'Decimal grid'] },
        ]},
        { title: 'Integers', topics: [
          { name: 'Understanding Integers', subtopics: ['Positive & negative numbers', 'Number line representation', 'Ordering integers'], periods: 4, bloom: 'Understand', outcomes: ['SWBAT represent and order integers on number line'], methods: ['Temperature analogy', 'Number line activity'], resources: ['NCERT Ch.6', 'Number line'] },
          { name: 'Operations with Integers', subtopics: ['Addition rules', 'Subtraction rules', 'Word problems'], periods: 4, bloom: 'Apply', outcomes: ['SWBAT add and subtract integers correctly'], methods: ['Chip model', 'Number line jumps'], resources: ['Integer chips', 'NCERT Ch.6'] },
        ]},
        { title: 'Algebra', topics: [
          { name: 'Variables & Expressions', subtopics: ['Variable concept', 'Algebraic expressions', 'Forming rules'], periods: 4, bloom: 'Understand', outcomes: ['SWBAT form and evaluate algebraic expressions'], methods: ['Pattern generalization', 'Matchstick patterns'], resources: ['NCERT Ch.11', 'Matchsticks'] },
          { name: 'Equations', subtopics: ['Setting up equations', 'Solving simple equations', 'Application problems'], periods: 4, bloom: 'Apply', outcomes: ['SWBAT set up and solve simple linear equations'], methods: ['Balance model', 'Trial-error method'], resources: ['NCERT Ch.11', 'Balance model'] },
        ]},
        { title: 'Mensuration & Data Handling', topics: [
          { name: 'Perimeter & Area', subtopics: ['Perimeter of shapes', 'Area of rectangle & square', 'Application problems'], periods: 5, bloom: 'Apply', outcomes: ['SWBAT calculate perimeter and area of basic shapes'], methods: ['Grid paper activity', 'Measurement activity'], resources: ['NCERT Ch.10', 'Grid paper', 'Ruler'] },
          { name: 'Data Handling', subtopics: ['Collecting & organizing data', 'Bar graphs', 'Pictographs'], periods: 4, bloom: 'Analyze', outcomes: ['SWBAT organize data and draw bar graphs'], methods: ['Survey activity', 'Graph plotting'], resources: ['NCERT Ch.9', 'Graph paper'] },
        ]},
      ],
    },
    'Grade 10': {
      Mathematics: [
        { title: 'Real Numbers', topics: [
          { name: 'Euclid\'s Division Lemma', subtopics: ['Euclid\'s division algorithm', 'Fundamental Theorem of Arithmetic', 'Applications of FTA'], periods: 4, bloom: 'Understand', outcomes: ['SWBAT apply Euclid\'s division lemma to find HCF', 'SWBAT express numbers as product of primes'], methods: ['Proof-based learning', 'Algorithm practice'], resources: ['NCERT Ch.1', 'Worked examples'] },
          { name: 'Rational & Irrational Numbers', subtopics: ['Revisiting rational numbers', 'Irrational number proofs', 'Decimal expansions'], periods: 4, bloom: 'Analyze', outcomes: ['SWBAT prove irrationality of numbers', 'SWBAT classify decimal expansions'], methods: ['Contradiction proofs', 'Classification activity'], resources: ['NCERT Ch.1', 'Number cards'] },
        ]},
        { title: 'Polynomials', topics: [
          { name: 'Zeros of Polynomials', subtopics: ['Geometric meaning of zeros', 'Relationship between zeros & coefficients', 'Cubic polynomials'], periods: 5, bloom: 'Apply', outcomes: ['SWBAT find zeros and verify relationships with coefficients'], methods: ['Graph plotting', 'Factor theorem application'], resources: ['NCERT Ch.2', 'Graph paper'] },
        ]},
        { title: 'Pair of Linear Equations', topics: [
          { name: 'Graphical Method', subtopics: ['Representing equations graphically', 'Consistent/Inconsistent systems', 'Intersection points'], periods: 4, bloom: 'Understand', outcomes: ['SWBAT solve linear equations graphically'], methods: ['Graph plotting', 'GeoGebra activity'], resources: ['NCERT Ch.3', 'Graph paper'] },
          { name: 'Algebraic Methods', subtopics: ['Substitution method', 'Elimination method', 'Cross-multiplication', 'Word problems'], periods: 5, bloom: 'Apply', outcomes: ['SWBAT solve systems using algebraic methods'], methods: ['Step-by-step practice', 'Real-life problems'], resources: ['NCERT Ch.3', 'Worksheet'] },
        ]},
        { title: 'Quadratic Equations', topics: [
          { name: 'Solving Quadratic Equations', subtopics: ['Factorization method', 'Quadratic formula', 'Nature of roots (discriminant)'], periods: 5, bloom: 'Apply', outcomes: ['SWBAT solve quadratic equations by factorization and formula'], methods: ['Formula derivation', 'Practice problems'], resources: ['NCERT Ch.4', 'Formula chart'] },
          { name: 'Applications', subtopics: ['Word problems', 'Optimization problems', 'Real-life applications'], periods: 4, bloom: 'Evaluate', outcomes: ['SWBAT formulate and solve quadratic equations from word problems'], methods: ['Problem-based learning', 'Case studies'], resources: ['NCERT Ch.4', 'Application worksheets'] },
        ]},
        { title: 'Arithmetic Progressions', topics: [
          { name: 'AP Fundamentals', subtopics: ['nth term of AP', 'Common difference', 'Sum of n terms'], periods: 5, bloom: 'Apply', outcomes: ['SWBAT find nth term and sum of AP'], methods: ['Pattern discovery', 'Formula application'], resources: ['NCERT Ch.5', 'Sequence cards'] },
        ]},
        { title: 'Triangles', topics: [
          { name: 'Similarity of Triangles', subtopics: ['AAA, SSS, SAS similarity', 'Basic proportionality theorem', 'Pythagoras theorem'], periods: 6, bloom: 'Analyze', outcomes: ['SWBAT prove triangles similar and apply BPT'], methods: ['Proof-based learning', 'Construction verification'], resources: ['NCERT Ch.6', 'Geometry kit'] },
        ]},
        { title: 'Coordinate Geometry', topics: [
          { name: 'Distance & Section Formula', subtopics: ['Distance formula', 'Section formula', 'Area of triangle formula'], periods: 5, bloom: 'Apply', outcomes: ['SWBAT find distance, mid-point, and area using coordinate formulas'], methods: ['Graph plotting', 'Formula practice'], resources: ['NCERT Ch.7', 'Graph paper'] },
        ]},
        { title: 'Statistics & Probability', topics: [
          { name: 'Statistics', subtopics: ['Mean of grouped data', 'Mode of grouped data', 'Median of grouped data', 'Ogive curves'], periods: 5, bloom: 'Apply', outcomes: ['SWBAT calculate mean, mode, median of grouped data'], methods: ['Data analysis activity', 'Graph plotting'], resources: ['NCERT Ch.13-14', 'Graph paper'] },
          { name: 'Probability', subtopics: ['Classical definition', 'Simple problems', 'Complementary events'], periods: 4, bloom: 'Apply', outcomes: ['SWBAT calculate probability of simple events'], methods: ['Dice/coin experiments', 'Simulation activity'], resources: ['NCERT Ch.15', 'Dice', 'Coins'] },
        ]},
      ],
    },
  },
};

// Get curriculum data for a grade/subject, with generic fallback for unlisted combos
function getCurriculumData(board: string, grade: string, subject: string): UnitTemplate[] {
  const boardData = CURRICULUM_KNOWLEDGE[board] || CURRICULUM_KNOWLEDGE['CBSE'];
  const gradeData = boardData[grade];

  if (gradeData && gradeData[subject]) {
    return gradeData[subject];
  }

  // Generate subject-specific generic curriculum
  const subjectTemplates: Record<string, UnitTemplate[]> = {
    Mathematics: [
      { title: 'Number Systems', topics: [
        { name: 'Number Properties & Operations', subtopics: ['Number classification', 'Operations & properties', 'Estimation'], periods: 4, bloom: 'Understand', outcomes: ['SWBAT classify and perform operations on different number types'], methods: ['Discovery learning', 'Practice problems'], resources: ['NCERT Textbook', 'Number cards'] },
        { name: 'Number Applications', subtopics: ['Problem solving', 'Real-world applications', 'Number patterns'], periods: 3, bloom: 'Apply', outcomes: ['SWBAT apply number concepts to solve problems'], methods: ['Problem-based learning', 'Mental math'], resources: ['Worksheets', 'Real-world data'] },
      ]},
      { title: 'Algebra', topics: [
        { name: 'Algebraic Expressions', subtopics: ['Variables & constants', 'Like & unlike terms', 'Simplification'], periods: 4, bloom: 'Understand', outcomes: ['SWBAT form and simplify algebraic expressions'], methods: ['Pattern generalization', 'Manipulative activity'], resources: ['Algebra tiles', 'NCERT Textbook'] },
        { name: 'Equations & Inequalities', subtopics: ['Linear equations', 'Solving techniques', 'Application problems'], periods: 5, bloom: 'Apply', outcomes: ['SWBAT solve equations and apply to word problems'], methods: ['Balance model', 'Step-by-step practice'], resources: ['Balance model', 'Worksheets'] },
      ]},
      { title: 'Geometry', topics: [
        { name: 'Geometric Concepts', subtopics: ['Lines & angles', 'Triangles', 'Quadrilaterals', 'Circles'], periods: 5, bloom: 'Understand', outcomes: ['SWBAT identify and describe geometric properties'], methods: ['Construction activity', 'Proof-based learning'], resources: ['Geometry kit', 'GeoGebra'] },
        { name: 'Geometric Reasoning', subtopics: ['Proofs', 'Constructions', 'Applications'], periods: 4, bloom: 'Analyze', outcomes: ['SWBAT prove geometric theorems and construct figures'], methods: ['Deductive reasoning', 'Hands-on construction'], resources: ['Compass', 'Protractor'] },
      ]},
      { title: 'Mensuration', topics: [
        { name: '2D Shapes', subtopics: ['Perimeter', 'Area formulas', 'Composite shapes'], periods: 4, bloom: 'Apply', outcomes: ['SWBAT calculate perimeter and area of 2D shapes'], methods: ['Grid paper activity', 'Formula application'], resources: ['Grid paper', 'Ruler'] },
        { name: '3D Shapes', subtopics: ['Surface area', 'Volume', 'Applications'], periods: 4, bloom: 'Apply', outcomes: ['SWBAT calculate surface area and volume of 3D shapes'], methods: ['Net-making activity', 'Real-world problems'], resources: ['3D models', 'NCERT Textbook'] },
      ]},
      { title: 'Statistics & Probability', topics: [
        { name: 'Data Handling', subtopics: ['Collection & organization', 'Measures of central tendency', 'Graphs'], periods: 5, bloom: 'Apply', outcomes: ['SWBAT organize data and calculate averages'], methods: ['Survey project', 'Graph plotting'], resources: ['Graph paper', 'Excel/Sheets'] },
        { name: 'Probability', subtopics: ['Basic probability', 'Experimental vs theoretical', 'Applications'], periods: 3, bloom: 'Apply', outcomes: ['SWBAT calculate and interpret probability'], methods: ['Experiments', 'Simulation'], resources: ['Dice', 'Coins', 'Cards'] },
      ]},
    ],
    English: [
      { title: 'Reading Comprehension', topics: [
        { name: 'Fiction & Non-fiction', subtopics: ['Literary passages', 'Factual passages', 'Inference & analysis'], periods: 5, bloom: 'Analyze', outcomes: ['SWBAT comprehend and analyze various text types'], methods: ['Close reading', 'Guided annotation'], resources: ['NCERT Textbook', 'Supplementary reader'] },
        { name: 'Poetry Analysis', subtopics: ['Understanding meaning', 'Literary devices', 'Appreciation & response'], periods: 3, bloom: 'Evaluate', outcomes: ['SWBAT analyze poems for meaning and technique'], methods: ['Recitation', 'Comparative analysis'], resources: ['NCERT poems', 'Audio recordings'] },
      ]},
      { title: 'Writing Skills', topics: [
        { name: 'Formal Writing', subtopics: ['Letter writing', 'Article writing', 'Speech writing'], periods: 5, bloom: 'Create', outcomes: ['SWBAT write formal letters, articles, and speeches'], methods: ['Process writing', 'Peer review'], resources: ['Sample formats', 'Rubrics'] },
        { name: 'Creative Writing', subtopics: ['Story writing', 'Description', 'Diary entries'], periods: 4, bloom: 'Create', outcomes: ['SWBAT write creative pieces with proper structure'], methods: ['Brainstorming', 'Drafting & editing'], resources: ['Writing prompts', 'Vocabulary lists'] },
      ]},
      { title: 'Grammar & Vocabulary', topics: [
        { name: 'Advanced Grammar', subtopics: ['Tenses review', 'Active-Passive Voice', 'Direct-Indirect Speech', 'Modals'], periods: 5, bloom: 'Apply', outcomes: ['SWBAT use advanced grammar correctly in writing'], methods: ['Rule-practice-application', 'Error correction'], resources: ['Grammar workbook', 'NCERT exercises'] },
        { name: 'Vocabulary Enhancement', subtopics: ['Word formation', 'Contextual usage', 'Synonyms & antonyms'], periods: 3, bloom: 'Apply', outcomes: ['SWBAT use new vocabulary accurately'], methods: ['Word wall', 'Contextual reading'], resources: ['Vocabulary lists', 'Dictionary skills'] },
      ]},
      { title: 'Literature', topics: [
        { name: 'Prose Study', subtopics: ['Character analysis', 'Theme exploration', 'Plot & setting'], periods: 5, bloom: 'Analyze', outcomes: ['SWBAT analyze literary texts for character, theme, and plot'], methods: ['Literature circles', 'Socratic seminar'], resources: ['NCERT Textbook', 'Character maps'] },
        { name: 'Drama & Supplementation', subtopics: ['Dramatic elements', 'Performance', 'Critical appreciation'], periods: 4, bloom: 'Evaluate', outcomes: ['SWBAT appreciate dramatic techniques and perform scenes'], methods: ['Role play', 'Scene enactment'], resources: ['NCERT Drama text', 'Video clips'] },
      ]},
    ],
    Science: [
      { title: 'Matter & Its Properties', topics: [
        { name: 'Nature of Matter', subtopics: ['Particle nature', 'States of matter', 'Changes of state'], periods: 4, bloom: 'Understand', outcomes: ['SWBAT explain the particle nature and states of matter'], methods: ['Demonstration', 'Simulation activity'], resources: ['NCERT Textbook', 'PhET simulations'] },
        { name: 'Physical & Chemical Changes', subtopics: ['Types of changes', 'Chemical reactions', 'Rusting & burning'], periods: 4, bloom: 'Analyze', outcomes: ['SWBAT distinguish physical and chemical changes'], methods: ['Lab experiments', 'Observation activity'], resources: ['Lab apparatus', 'Worksheets'] },
      ]},
      { title: 'Living World', topics: [
        { name: 'Cell Biology', subtopics: ['Cell structure', 'Cell organelles', 'Cell division'], periods: 5, bloom: 'Understand', outcomes: ['SWBAT describe cell structure and functions of organelles'], methods: ['Microscope observation', 'Model making'], resources: ['Microscope', 'Cell models'] },
        { name: 'Plant & Human Systems', subtopics: ['Nutrition', 'Respiration', 'Transport', 'Reproduction'], periods: 5, bloom: 'Apply', outcomes: ['SWBAT explain various life processes in plants and humans'], methods: ['Diagram-based learning', 'Flowcharts'], resources: ['NCERT Textbook', 'Anatomical charts'] },
      ]},
      { title: 'Force & Motion', topics: [
        { name: 'Motion & Measurement', subtopics: ['Types of motion', 'Speed & velocity', 'Acceleration'], periods: 4, bloom: 'Understand', outcomes: ['SWBAT describe types of motion and calculate speed'], methods: ['Graph analysis', 'Experimental measurement'], resources: ['Ticker timer', 'Graph paper'] },
        { name: 'Force & Laws of Motion', subtopics: ['Newton\'s laws', 'Friction', 'Pressure'], periods: 5, bloom: 'Apply', outcomes: ['SWBAT apply Newton\'s laws to solve problems'], methods: ['Problem solving', 'Experiment-based'], resources: ['Newton\'s cradle', 'Spring balance'] },
      ]},
      { title: 'Light & Sound', topics: [
        { name: 'Light', subtopics: ['Reflection', 'Refraction', 'Lenses & mirrors', 'Dispersion'], periods: 5, bloom: 'Apply', outcomes: ['SWBAT apply laws of reflection and refraction'], methods: ['Ray diagram practice', 'Lab experiments'], resources: ['Mirror', 'Lens kit', 'Prism'] },
        { name: 'Sound', subtopics: ['Production & propagation', 'Characteristics', 'Echo & SONAR'], periods: 4, bloom: 'Understand', outcomes: ['SWBAT explain properties and behavior of sound'], methods: ['Tuning fork activity', 'Oscilloscope demo'], resources: ['Tuning forks', 'Oscilloscope'] },
      ]},
      { title: 'Our Environment', topics: [
        { name: 'Ecosystems', subtopics: ['Components of ecosystem', 'Food chains & webs', 'Energy flow'], periods: 4, bloom: 'Understand', outcomes: ['SWBAT describe ecosystem components and energy flow'], methods: ['Field visit', 'Food web construction'], resources: ['NCERT Textbook', 'Field guides'] },
        { name: 'Environmental Issues', subtopics: ['Pollution', 'Conservation', 'Sustainable development'], periods: 3, bloom: 'Evaluate', outcomes: ['SWBAT evaluate environmental issues and propose solutions'], methods: ['Case study', 'Project work'], resources: ['Current data', 'Documentary clips'] },
      ]},
      { title: 'Chemical Reactions', topics: [
        { name: 'Types of Reactions', subtopics: ['Combination', 'Decomposition', 'Displacement', 'Oxidation-reduction'], periods: 5, bloom: 'Analyze', outcomes: ['SWBAT identify and classify chemical reactions'], methods: ['Lab experiments', 'Equation balancing'], resources: ['Chemicals', 'Lab apparatus'] },
        { name: 'Acids, Bases & Salts', subtopics: ['Properties', 'Indicators', 'Neutralization', 'pH scale'], periods: 4, bloom: 'Apply', outcomes: ['SWBAT identify acids/bases and describe neutralization'], methods: ['Indicator testing', 'pH measurement'], resources: ['pH paper', 'Indicators', 'NCERT Textbook'] },
      ]},
    ],
  };

  return subjectTemplates[subject] || [
    { title: `Unit 1: Introduction to ${subject}`, topics: [
      { name: 'Foundations', subtopics: ['Core concepts', 'Key terminology', 'Basic principles'], periods: 4, bloom: 'Remember', outcomes: [`SWBAT identify core concepts of ${subject}`], methods: ['Lecture-Discussion', 'Reading activity'], resources: ['Textbook', 'Worksheets'] },
      { name: 'Fundamental Skills', subtopics: ['Basic skills', 'Practice exercises', 'Applications'], periods: 4, bloom: 'Understand', outcomes: [`SWBAT demonstrate fundamental ${subject} skills`], methods: ['Guided practice', 'Pair work'], resources: ['Practice sheets', 'Reference material'] },
    ]},
    { title: `Unit 2: Core Topics in ${subject}`, topics: [
      { name: 'Theory & Concepts', subtopics: ['Main theories', 'Conceptual framework', 'Critical analysis'], periods: 5, bloom: 'Analyze', outcomes: [`SWBAT analyze core theories of ${subject}`], methods: ['Inquiry-based learning', 'Discussion'], resources: ['Textbook', 'Case studies'] },
      { name: 'Practical Applications', subtopics: ['Real-world scenarios', 'Problem solving', 'Projects'], periods: 4, bloom: 'Apply', outcomes: [`SWBAT apply ${subject} concepts to real-world problems`], methods: ['Project-based learning', 'Experiential'], resources: ['Project guides', 'Field data'] },
    ]},
    { title: `Unit 3: Advanced ${subject}`, topics: [
      { name: 'Advanced Concepts', subtopics: ['Complex theories', 'Advanced techniques', 'Current developments'], periods: 5, bloom: 'Evaluate', outcomes: [`SWBAT evaluate advanced concepts in ${subject}`], methods: ['Socratic seminar', 'Research activity'], resources: ['Reference books', 'Online resources'] },
    ]},
    { title: `Unit 4: ${subject} Integration & Assessment`, topics: [
      { name: 'Cross-Disciplinary Connections', subtopics: ['Links to other subjects', 'Real-life applications', 'Future pathways'], periods: 4, bloom: 'Create', outcomes: [`SWBAT create projects integrating ${subject} with other domains`], methods: ['Interdisciplinary project', 'Portfolio building'], resources: ['Multi-subject references', 'Portfolio templates'] },
      { name: 'Revision & Assessment', subtopics: ['Comprehensive review', 'Practice assessments', 'Self-evaluation'], periods: 3, bloom: 'Evaluate', outcomes: [`SWBAT demonstrate mastery of ${subject} concepts through assessment`], methods: ['Review sessions', 'Practice tests'], resources: ['Sample papers', 'Revision notes'] },
    ]},
  ];
}

function generateComprehensiveCurriculum(
  board: string, grade: string, subject: string, academicYear: string,
  totalWeeks: number, periodsPerWeek: number, periodDuration: number,
  termStructure: string, medium: string, specialRequirements: string
) {
  const totalPeriodsAvailable = totalWeeks * periodsPerWeek;
  const bufferPeriods = Math.round(totalPeriodsAvailable * 0.12);
  const teachingPeriods = totalPeriodsAvailable - bufferPeriods;

  const unitTemplates = getCurriculumData(board, grade, subject);
  const isSemester = termStructure.includes('semester') || termStructure === '2-semester';

  // Distribute units across terms
  const totalUnits = unitTemplates.length;
  const termNames = isSemester
    ? [{ name: 'Semester 1', weeks: '1-20' }, { name: 'Semester 2', weeks: '21-40' }]
    : [{ name: 'Term 1', weeks: '1-13' }, { name: 'Term 2', weeks: '14-26' }, { name: 'Term 3', weeks: '27-40' }];

  const termsPerCount = Math.ceil(totalUnits / termNames.length);

  // Calculate periods per unit (distribute evenly, respecting teaching periods)
  const periodsPerUnit = Math.floor(teachingPeriods / totalUnits);

  let totalAllocated = 0;

  // Build section C (units with topics)
  const sectionC: Record<string, unknown>[] = [];
  let globalSeq = 0;

  for (let u = 0; u < totalUnits; u++) {
    const template = unitTemplates[u];
    const termIdx = Math.min(Math.floor(u / termsPerCount), termNames.length - 1);
    const term = termNames[termIdx];

    const topics = template.topics.map((t, ti) => {
      totalAllocated += t.periods;
      globalSeq++;
      const weekStart = (globalSeq - 1) * 2 + 1;
      return {
        topicTitle: t.name,
        subtopics: t.subtopics,
        curriculumCode: `${board.substring(0, 3).toUpperCase()}.${grade.replace(/\s/g, '')}.${subject.substring(0, 3).toUpperCase()}.U${u + 1}.T${ti + 1}`,
        learningOutcomes: t.outcomes,
        bloomLevels: [t.bloom],
        estimatedPeriods: t.periods,
        termMonthWeek: `${term.name} / Week ${weekStart}-${weekStart + Math.ceil(t.periods / periodsPerWeek) - 1}`,
        prerequisiteKnowledge: u === 0 && ti === 0 ? 'Basic knowledge from previous grade' : `Understanding of previous topic`,
        keyVocabulary: t.subtopics.slice(0, 3),
        suggestedTeachingMethods: t.methods,
        learningResources: t.resources,
        assessmentType: ti % 2 === 0 ? 'Formative — Oral quiz, worksheet, class discussion' : 'Summative — Unit test, written examination',
        crossCurricularLinks: 'Connected to Mathematics and real-world applications',
        skillsDeveloped: ['Critical Thinking', 'Problem Solving', 'Communication'],
        differentiationNotes: 'Support: Scaffolded worksheets with guided examples; Extension: Challenge problems, advanced applications, and peer teaching opportunities',
        valuesLifeSkills: 'Perseverance, teamwork, analytical thinking, responsibility',
      };
    });

    const unitPeriods = topics.reduce((s, t) => s + (Number(t.estimatedPeriods) || 1), 0);

    sectionC.push({
      unitNo: u + 1,
      unitTitle: template.title,
      topics,
      totalPeriods: unitPeriods,
    });
  }

  // Build section B (scope & sequence)
  const sectionBTerms = termNames.map((t, idx) => {
    const startUnit = idx * termsPerCount + 1;
    const endUnit = Math.min((idx + 1) * termsPerCount, totalUnits);
    return {
      termName: t.name,
      weeks: t.weeks,
      units: sectionC
        .filter(u => Number(u.unitNo) >= startUnit && Number(u.unitNo) <= endUnit)
        .map(u => ({
          unitNo: u.unitNo,
          unitTitle: u.unitTitle,
          estimatedPeriods: u.totalPeriods,
          termWeeks: `Weeks ${(Number(u.unitNo) - startUnit) * 5 + 1}-${(Number(u.unitNo) - startUnit + 1) * 5}`,
        })),
    };
  });

  // Build section A (overview)
  const sectionA = {
    board, grade, subject, academicYear,
    totalPeriodsAvailable,
    totalPeriodsAllocated: totalAllocated,
    totalHoursAvailable: Math.round((teachingPeriods * periodDuration) / 60),
    totalHoursAllocated: Math.round((totalAllocated * periodDuration) / 60),
    subjectPhilosophy: `This ${board} ${grade} ${subject} curriculum is designed to build progressive conceptual understanding through inquiry-based learning, aligned with ${board} standards and NCERT guidelines. Students will develop critical thinking, analytical reasoning, and the ability to apply ${subject} concepts to real-world situations through a carefully scaffolded progression from foundational knowledge to higher-order thinking skills.`,
    keyCompetencies: ['Critical Thinking & Problem Solving', 'Analytical Reasoning & Logical Thinking', 'Communication & Mathematical Expression', 'Collaboration & Teamwork', 'Creativity & Innovation', 'Digital Literacy & Information Processing'],
  };

  // Build section D (assessment framework)
  const sectionD = {
    formativeWeightage: '40%',
    summativeWeightage: '60%',
    internalAssessment: 'Periodic tests (10%), Notebook maintenance (5%), Subject enrichment activities (5%), Portfolio (5%), Lab work/Practical (5%)',
    projectWork: 'One interdisciplinary project per term — research-based, model-making, or presentation format. Students work in groups of 3-4.',
    practicals: ['Science', 'Physics', 'Chemistry', 'Computer Science'].includes(subject) ? 'Lab experiments as per CBSE guidelines — minimum 10 per year with viva' : 'Not applicable for this subject',
    examinationSchedule: [
      { examName: 'Periodic Test 1', term: 'Semester 1', tentativePeriod: 'July Week 3' },
      { examName: 'Mid-Term Examination', term: 'Semester 1', tentativePeriod: 'September Week 3' },
      { examName: 'Periodic Test 2', term: 'Semester 2', tentativePeriod: 'December Week 2' },
      { examName: 'Annual Examination', term: 'Semester 2', tentativePeriod: 'March Week 2' },
    ],
    sampleRubricCriteria: ['Knowledge & Understanding (25%)', 'Application & Analysis (30%)', 'Communication & Presentation (20%)', 'Creativity & Originality (15%)', 'Timeliness & Effort (10%)'],
  };

  // Build section E (resources)
  const sectionE = {
    prescribedTextbooks: [`NCERT ${subject} Textbook for ${grade} (Latest Edition)`, `${board} ${subject} Workbook`],
    referenceBooks: [`Oxford ${subject} Guide for ${grade}`, `Arihant/S Chand ${subject} for ${grade}`, `Previous Year Question Papers`],
    digitalPlatforms: ['DIKSHA Portal (Government of India)', 'Khan Academy India', 'Byju\'s/The Learning App'],
    labEquipment: ['Science', 'Physics', 'Chemistry'].includes(subject) ? ['Lab apparatus as per CBSE experiment list', 'Safety goggles and equipment', 'Chemical reagents'] : [],
    manipulatives: ['Charts & Working Models', 'Geometry Kit (for Mathematics)', 'Graph Paper & Rulers', 'Flash Cards & Reference Charts'],
  };

  // Build section F (pacing calendar)
  const months = [
    { name: 'April', weeks: 4 }, { name: 'May', weeks: 4 }, { name: 'June', weeks: 2 },
    { name: 'July', weeks: 4 }, { name: 'August', weeks: 4 }, { name: 'September', weeks: 3 },
    { name: 'October', weeks: 4 }, { name: 'November', weeks: 4 }, { name: 'December', weeks: 3 },
    { name: 'January', weeks: 4 }, { name: 'February', weeks: 4 }, { name: 'March', weeks: 2 },
  ];

  let unitIdx = 0;
  let topicIdx = 0;
  const sectionFMonths = months.map((m, mi) => {
    const isExamMonth = m.name === 'September' || m.name === 'March';
    const isHoliday = m.name === 'June' || m.name === 'December';

    return {
      month: m.name,
      weeks: Array.from({ length: m.weeks }, (_, wi) => {
        if (isHoliday && wi >= m.weeks - 1) {
          return { week: `Week ${wi + 1}`, content: 'Holiday / Vacation', isBuffer: true, bufferType: 'Holiday' };
        }
        if (isExamMonth && wi >= m.weeks - 1) {
          return { week: `Week ${wi + 1}`, content: 'Examination Week', isBuffer: true, bufferType: 'Assessment' };
        }

        const currentUnit = sectionC[unitIdx];
        const currentTopics = currentUnit?.topics as Record<string, unknown>[] || [];
        const currentTopic = currentTopics[topicIdx];

        let content = 'Continuation & Practice';
        if (currentTopic) {
          content = `${currentUnit?.unitTitle || 'Unit'} — ${currentTopic.topicTitle || 'Topic'}`;
        }

        topicIdx++;
        if (currentTopics.length > 0 && topicIdx >= currentTopics.length) {
          topicIdx = 0;
          unitIdx = Math.min(unitIdx + 1, sectionC.length - 1);
        }

        return { week: `Week ${wi + 1}`, content, isBuffer: false, bufferType: null };
      }),
    };
  });

  // Build section G (integration layers)
  const sectionG = {
    ictIntegration: ['Smart Board presentations for visual learning', 'Online simulations (PhET, GeoGebra) for concept visualization', 'Digital assessment tools (Google Forms, Quizizz)', 'Video-based flipped classroom for advanced topics'],
    experientialLearning: ['Hands-on lab experiments and activities', 'Field surveys and data collection projects', 'Model-making and demonstration projects', 'Peer teaching and collaborative problem-solving sessions'],
    fieldTripsGuestSessions: ['Industry/lab visit relevant to subject concepts', 'Guest lecture by subject-matter expert', 'Science museum / planetarium / math lab visit', 'Inter-school competition and workshop participation'],
    coCurricularLinkages: ['Olympiad preparation (Math/Science/English)', 'Quiz and debate competitions', 'Subject-specific clubs and activities', 'Art integration and interdisciplinary projects'],
  };

  return {
    sectionA,
    sectionB: { terms: sectionBTerms },
    sectionC,
    sectionD,
    sectionE,
    sectionF: { months: sectionFMonths },
    sectionG,
  };
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

    // ── STEP 1: Instantly generate comprehensive curriculum from knowledge base ──
    // This always succeeds and provides a complete 7-section curriculum
    console.log(`[CurriculumArchitect] Generating curriculum for ${board} ${grade} ${subject}`);
    const curriculum = generateComprehensiveCurriculum(
      board, grade, subject, academicYear, totalWeeks, periodsPerWeek,
      periodDuration, termStructure, medium, specialRequirements
    );

    // ── STEP 2: Try ONE focused AI call to enhance the unit topics ──
    // This adds authentic board-specific topic names and learning outcomes
    // If it fails, the knowledge base curriculum is still complete and valid
    console.log(`[CurriculumArchitect] Enhancing with AI for ${grade} ${subject}...`);
    let aiEnhanced = false;

    try {
      const zai = await ZAI.create();

      // Create a focused, small prompt just for topic names and outcomes
      const unitTitles = (curriculum.sectionC as Record<string, unknown>[]).map(
        u => `Unit ${u.unitNo}: ${u.unitTitle}`
      ).join('\n');

      const aiResult = await zai.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: `You are an expert ${board} curriculum designer. Generate ONLY valid JSON. No markdown, no explanations. Be precise and board-specific.`,
          },
          {
            role: 'user',
            content: `For ${board} ${grade} ${subject}, suggest more specific topic names and learning outcomes for these units:
${unitTitles}

Return JSON: {"enhancedTopics": [{"unitNo": 1, "topics": [{"topicTitle": "specific topic name", "learningOutcomes": ["SWBAT specific outcome 1", "SWBAT specific outcome 2"], "keyVocabulary": ["term1", "term2"]}]}]}

Keep it brief — just topic titles, 2 outcomes each, and 2-3 vocabulary terms per topic. Maximum 4 topics per unit.`,
          },
        ],
        temperature: 0.4,
        max_tokens: 3000,
      });

      const aiData = safeParseJSON(aiResult.choices?.[0]?.message?.content || '');
      if (aiData && Array.isArray(aiData.enhancedTopics)) {
        // Merge AI enhancements into the curriculum
        for (const aiUnit of aiData.enhancedTopics) {
          const aiUnitObj = aiUnit as Record<string, unknown>;
          const matchingUnit = (curriculum.sectionC as Record<string, unknown>[]).find(
            u => Number(u.unitNo) === Number(aiUnitObj.unitNo)
          );
          if (matchingUnit && Array.isArray(aiUnitObj.topics)) {
            const existingTopics = matchingUnit.topics as Record<string, unknown>[];
            for (const aiTopic of aiUnitObj.topics) {
              const at = aiTopic as Record<string, unknown>;
              // Find matching topic by index and enhance
              const topicIdx = (aiUnitObj.topics as unknown[]).indexOf(aiTopic);
              if (topicIdx < existingTopics.length && at.topicTitle) {
                existingTopics[topicIdx].topicTitle = at.topicTitle;
                if (Array.isArray(at.learningOutcomes) && at.learningOutcomes.length > 0) {
                  existingTopics[topicIdx].learningOutcomes = at.learningOutcomes;
                }
                if (Array.isArray(at.keyVocabulary) && at.keyVocabulary.length > 0) {
                  existingTopics[topicIdx].keyVocabulary = at.keyVocabulary;
                }
              }
            }
          }
        }
        aiEnhanced = true;
        console.log(`[CurriculumArchitect] AI enhancement successful — topics updated with board-specific content`);
      }
    } catch (e) {
      console.warn('[CurriculumArchitect] AI enhancement failed (using knowledge base as-is):', e);
    }

    // ── STEP 3: Save to database ──
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
        sectionA: JSON.stringify(curriculum.sectionA),
        sectionB: JSON.stringify(curriculum.sectionB),
        sectionC: JSON.stringify(curriculum.sectionC),
        sectionD: JSON.stringify(curriculum.sectionD),
        sectionE: JSON.stringify(curriculum.sectionE),
        sectionF: JSON.stringify(curriculum.sectionF),
        sectionG: JSON.stringify(curriculum.sectionG),
        fullDocument: JSON.stringify(curriculum),
      },
    });

    // Create CurriculumTopic entries for backwards compatibility
    const savedTopics = [];
    let seq = 1;
    for (const unit of (curriculum.sectionC as Record<string, unknown>[])) {
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

    const totalAllocated = (curriculum.sectionA as Record<string, unknown>).totalPeriodsAllocated;
    console.log(`[CurriculumArchitect] Curriculum generated: ${doc.id}, ${savedTopics.length} topics, ${totalAllocated} periods, AI enhanced: ${aiEnhanced}`);

    return NextResponse.json({
      success: true,
      documentId: doc.id,
      curriculum: {
        sectionA: curriculum.sectionA,
        sectionB: curriculum.sectionB,
        sectionC: curriculum.sectionC,
        sectionD: curriculum.sectionD,
        sectionE: curriculum.sectionE,
        sectionF: curriculum.sectionF,
        sectionG: curriculum.sectionG,
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
