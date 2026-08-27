const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function seedDefaults() {
  // 1. Ensure SuperAdmin exists
  const superAdmin = await prisma.admin.upsert({
    where: { email: 'sp@kamglobalai.com' },
    update: {
      isSuperAdmin: true,
      name: 'Platform SuperAdmin',
      password: 'P@ssw0rd123',
    },
    create: {
      email: 'sp@kamglobalai.com',
      name: 'Platform SuperAdmin',
      password: 'P@ssw0rd123',
      isSuperAdmin: true,
    },
  });
  console.log('SuperAdmin upserted:', superAdmin.email);

  // 2. Ensure Client Pilot school admin exists with ClientPilot2026
  const pilot = await prisma.school.upsert({
    where: { code: 'CLIENTPILOT' },
    update: {
      email: 'pilot@client.school',
      password: 'ClientPilot2026',
      name: 'Client Pilot School',
    },
    create: {
      name: 'Client Pilot School',
      code: 'CLIENTPILOT',
      email: 'pilot@client.school',
      password: 'ClientPilot2026',
    },
  });
  console.log('Pilot school upserted:', pilot.email);

  // 3. Ensure priya.math@dps.edu alias exists
  const dpsSchool = await prisma.school.findFirst({ where: { code: 'DPS2025' } });
  if (dpsSchool) {
    const priya = await prisma.teacher.upsert({
      where: { email: 'priya.math@dps.edu' },
      update: {
        password: 'teacher123',
        schoolId: dpsSchool.id,
      },
      create: {
        name: 'Priya Sharma',
        email: 'priya.math@dps.edu',
        subject: 'Mathematics',
        grades: JSON.stringify(['Grade 9', 'Grade 10']),
        password: 'teacher123',
        schoolId: dpsSchool.id,
      },
    });
    console.log('Teacher Priya upserted:', priya.email);
  }
}

seedDefaults().catch(console.error).finally(() => prisma.$disconnect());
