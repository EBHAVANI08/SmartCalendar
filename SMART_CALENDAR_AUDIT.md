# Smart Calendar implementation audit

Audit date: 2026-08-12

## Implemented and verified

- Production domain schema for academic years, terms, campuses, classes, subjects, qualifications, availability, workload, rooms, bell schedules and scheduling rules.
- Versioned timetable drafts with review, approval, publication and archive states.
- Tenant-scoped timetable slots with class, teacher and room collision constraints.
- Publication blocking when unresolved validation errors exist.
- Timetable feasibility validation for capacity and unallocated subject requirements.
- Nine-sheet XLSX template and workbook validation.
- Cross-sheet validation for teacher, class, subject requirement, room and fixed-period references.
- Unified calendar event storage with categories, timezone, recurrence rule, applicability and room-conflict detection.
- Audit, approval, import-report and notification-delivery records.
- Transactional substitute reservation with an idempotency key and unique teacher/date/period protection.
- Automatic Prisma Client regeneration after dependency installation.
- Isolated TypeScript audit for all newly introduced APIs.

## Implemented foundation, further application wiring required

- Import persistence models exist; validated workbook commit/rollback UI is not wired into the current page.
- Generation job and candidate models exist; a queue worker and optimization solver are not yet connected.
- Calendar subscription records exist; Google and Microsoft OAuth/provider adapters require credentials and provider setup.
- Notification delivery records exist; SMS, WhatsApp, email and push providers require external accounts.
- Event recurrence is stored; recurrence expansion and reminder workers are not yet scheduled.
- Timetable version APIs exist; the existing legacy timetable screen still uses the legacy `Schedule` model.

## Verification commands

```text
npm run db:generate
npm run typecheck:smart-calendar
npm run build
```

## Known repository-wide findings

- The main `tsconfig.json` includes archived `fv-extract`, `fvtar-extract`, and example source trees. Those copies target incompatible historical Prisma schemas and make an unscoped repository TypeScript run fail.
- Several pre-existing routes in `src/app/api` also refer to fields from a different historical schema. They are outside the isolated new Smart Calendar slice and require a separate legacy-schema reconciliation.
- Dependency audit reported 13 vulnerabilities after installing XLSX. A breaking `npm audit fix --force` was intentionally not executed.
- Database schema validation and client generation do not apply schema changes to a production database. Deployment must run a reviewed Prisma migration before enabling the new endpoints.

## Completion assessment

## Final implementation update - 2026-08-12

Completed locally and deployed:

- PostgreSQL versioned timetable schema, tenant-safe legacy schedule constraint, collision constraints and audit models.
- Six-workspace parent timetable UI with URL-persistent child navigation and shared data.
- Automatic context bootstrap for campus, academic year, term and initial draft.
- Persisted generation jobs with cancellation and SSE progress.
- Constraint-driven candidate generation using qualifications, availability, workload, rooms, bell periods and locked slots.
- Candidate comparison, recommendation and transactional selection into a working draft.
- Version cloning, validation, issues, slot CRUD, locking-compatible updates, deletion and swapping.
- Draft, review, approval, rejection, publication and archive workflow with atomic publication safeguards.
- Flexible roster and grade-section matrix imports, complete workbook validation, normalized multilingual grade parsing and retained import metadata.
- Excel and ICS exports.
- Notification-delivery worker with real portal delivery and explicit configuration-required status for external channels.
- PostgreSQL health endpoint and automated architecture/workflow tests.
- Role/action permission matrix for timetable operations.

Verification completed:

```text
TypeScript smart-calendar check: PASS
Automated timetable tests: 4/4 PASS
Next.js production compile: PASS
PostgreSQL schema synchronization: PASS
```

External activation requirements are not unfinished application code:

- Email, SMS, WhatsApp and push delivery need provider credentials.
- Google and Microsoft calendar write synchronization need OAuth applications and tenant consent.
- Object-storage retention of original binary workbooks needs an S3-compatible bucket and credentials; import hashes, reports and audit metadata are retained in PostgreSQL now.
- A distributed Redis/BullMQ deployment is optional for multi-instance scale; the implemented database-backed generator and SSE progress operate without it.
