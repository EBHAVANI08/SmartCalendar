# AI Smart Calendar

The intelligent operating system for modern schools — clash-free master timetables, biometric absence detection, instant substitutions, AI leave management, and a multi-tenant owner console.

**Tagline:** Automate clash-free master timetables in 60 seconds, detect teacher absences via biometric punches, and alert substitutes in real time.

---

## Features

- **Timetable Studio** — AI / constraint-based generation, bulk Excel upload, print-ready PDFs
- **Substitutions** — pending cover assignment, clash-aware substitute matching
- **AI Leave Management** — apply, approve, and surface teachers on leave today
- **Faculty Directory** — teacher records, timetable print/export, bulk upload
- **Biometric Attendance** — IoT punch sync and absentee flags
- **Rooms & Academic Calendar** — facilities and school-year events
- **Support & Tickets** — school-to-owner messaging
- **Notifications** — header inbox for substitutions, leaves, tickets, and owner alerts
- **My Profile & School Settings** — account identity vs institutional configuration
- **Owner Console** (`/superadmin`) — tenants, seats, payments, coupons, tickets, website & SEO

---

## Tech stack

| Layer | Stack |
| --- | --- |
| App | Next.js 16, React 19, TypeScript, Tailwind CSS, shadcn/ui |
| Data | Prisma + MongoDB |
| Auth | JWT cookie session, role-based school / teacher / owner access |
| AI | Groq + Z-AI fallback for timetable and leave assistance |

---

## Getting started

**Requirements:** Node.js 20+ and a MongoDB database.

```bash
git clone https://github.com/EBHAVANI08/SmartCalendar.git
cd SmartCalendar
npm install
```

Create a `.env` file in the project root (do not commit it):

```env
DATABASE_URL="mongodb+srv://USER:PASSWORD@HOST/DB?retryWrites=true&w=majority"
JWT_SECRET="your-long-random-secret"
GROQ_API_KEY=""
ZAI_API_KEY=""
ZAI_API_KEY_ID=""
SUPERADMIN_TOKEN=""
```

Push the Prisma schema, then start the app (dev server uses **port 3005**):

```bash
npx prisma generate
npx prisma db push
npm run dev
```

Open [http://localhost:3005](http://localhost:3005).

| Script | Purpose |
| --- | --- |
| `npm run dev` | Local development on port 3005 |
| `npm run build` | Production build (runs Prisma generate first) |
| `npm start` | Run the production server |
| `npm run db:push` | Sync Prisma schema to MongoDB |

---

## Demo login

Sign in at `/login`. 1-click buttons are **Takshila School** tenant accounts only (Admin and Teacher). SuperAdmin is not on the 1-click bar — use the Sign In form for the owner console.

| Role | Where | Notes |
| --- | --- | --- |
| School Admin | `/dashboard` | Takshila Principal 1-click |
| Teacher | `/dashboard` | Takshila class-teacher 1-click |
| SuperAdmin | `/superadmin` | Owner console — sign in with the platform owner email |

---

## Project layout

```
src/app/(app)/          School workspace (dashboard, timetable, substitutions, profile, settings)
src/app/superadmin/     Owner console
src/app/api/            REST routes (auth, tenants, notifications, tickets, website)
src/components/layout/  Sidebar, header, notifications, profile menu
prisma/schema.prisma    MongoDB data model
```

---

## Author & contact

**Sunku Nagateja**  
Lead Developer & Maintainer

- 💼 LinkedIn: [https://www.linkedin.com/in/sunku-nagateja/]
- Email: [info@kamglobalai.com](mailto:info@kamglobalai.com)

---

## License

Private project. All rights reserved unless a license file is added to this repository.
