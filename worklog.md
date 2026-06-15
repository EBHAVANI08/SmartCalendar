---
Task ID: 1
Agent: Main Agent
Task: Fix Application Error when clicking "View AI Substitute Context" button in Substitutions — Manage Teacher Absences section

Work Log:
- Explored project structure: Next.js 16 + React 19 + TypeScript full-stack app with SQLite/Prisma
- Identified key files: src/app/page.tsx (SubstitutionsSection component), src/app/api/biometric/generate-sub-context/route.ts (API)
- Found the "View AI Substitute Context" button code at line 2888-2909 and the main button at 2834-2887
- Found the AI Substitute Context Popup Dialog at line 3313-3497
- Analyzed the API route thoroughly - it generates context from lesson plans, schedules, and AI
- Identified multiple root causes for the Application error:

Root Cause 1: `selectedSub` state goes stale after `onRefresh()` updates substitutions
- After generating AI context, `onRefresh()` fetches updated substitutions from the API
- But `selectedSub` (local state) still references the old substitution object
- This means `selectedSub.subContext` could be null even after the database was updated
- Clicking "View AI Substitute Context" with stale data could cause errors

Root Cause 2: No error boundary in the app
- No error.tsx file existed, so any unhandled React rendering error would show the generic Next.js "Application error" page
- If the Dialog component threw during rendering, the entire app would crash

Root Cause 3: Insufficient null/type guards in Dialog rendering
- Direct property access on `subContextData` (e.g., `subContextData.absentTeacher?.name`) without checking if `subContextData` is a proper object
- `subContextData.yesterdayDetails.keyConcepts` could throw if `yesterdayDetails` was not an object
- No try-catch around the `safeText` function
- Materials Needed was always rendered as text even when it's an array

Root Cause 4: API route had insufficient error handling
- No validation of request body format
- No check for missing `absentTeacher` relation
- Database errors would propagate as unhandled exceptions

Fixes Applied:
1. Added useEffect to sync `selectedSub` when `substitutions` prop changes (line 2417-2425)
2. Added `subContextError` state to track and display errors inline
3. Enhanced main button onClick: added `!Array.isArray(ctx)` check, better error logging, validation of API response data
4. Enhanced "View" button onClick: added `!Array.isArray(ctx)` check, better error handling
5. Completely rewrote Dialog rendering with:
   - Type guard: `subContextData && typeof subContextData === 'object' && !Array.isArray(subContextData)`
   - Try-catch around `safeText` function
   - Safe extraction of nested properties (`absentTeacher`, `yesterdayDetails`) with proper type checks
   - `getNested` helper function for safe property traversal
   - Try-catch around `renderTodayCoveragePlan`
   - Materials Needed now renders as bullet list when it's an array
   - Fallback UI when subContextData is invalid
   - Better Dialog onOpenChange handler that clears errors on close
6. Created error.tsx with a proper error boundary and "Try Again" button
7. Improved API route error handling:
   - Validate request body format
   - Check for missing `absentTeacher` relation
   - Wrap database queries in try-catch
   - Better error messages

Stage Summary:
- Fixed 3 files: src/app/page.tsx, src/app/api/biometric/generate-sub-context/route.ts, src/app/error.tsx (new)
- Build succeeds with no errors
- All changes are minimal and targeted - no other sections/features affected
