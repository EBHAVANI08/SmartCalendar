---
Task ID: 1
Agent: Main Agent
Task: Fix "Generate AI Substitute Context" button - Application Error

Work Log:
- Read the API route at `/api/biometric/generate-sub-context/route.ts`
- Read the frontend popup dialog code in `page.tsx` (lines 3288-3403)
- Read the button handlers (lines 2833-2883)
- Read the Prisma schema to understand data models
- Tested the database: 348 substitutions, 1 lesson plan, 0 substitutions with context
- Identified root cause #1: `todayCoveragePlan` field was returned by AI as an object `{topic, objectives, keyPoints}` but rendered as `{subContextData.todayCoveragePlan}` which causes React "Objects are not valid as a React child" error
- Identified root cause #2: `z-ai-web-dev-sdk` dynamic import crashes the Turbopack dev server due to memory issues when compiling on top of the already-compiled 351KB page.tsx
- Identified root cause #3: The `subContext` field stored as string "null" in DB caused the "View AI Substitute Context" button to show for records without actual context

Stage Summary:
- Fixed API route: replaced `z-ai-web-dev-sdk` import with native `fetch` + `fs.readFileSync` for AI config (avoids memory crash)
- Fixed API route: `todayCoveragePlan` is now properly converted from object to string before storing
- Fixed API route: Better JSON parsing for AI responses (handles markdown code blocks, aggressive extraction)
- Fixed API route: Added try-catch around all DB queries, curriculum topics, lesson plans
- Fixed frontend popup: Added `safeText()` utility function to safely render any data type as text
- Fixed frontend popup: Added `renderTodayCoveragePlan()` function to handle both string and object types
- Fixed frontend popup: Added absent teacher name to header
- Fixed "View AI Substitute Context" button: Checks for "null" string, validates parsed data is object
- Fixed "Generate AI Substitute Context" button: If context exists, shows popup directly; if not, generates new
- Created production startup script at `/home/z/my-project/start-server.sh`
- Verified API works correctly in production mode - generates comprehensive AI context with all required fields
