const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const schools = await prisma.school.findMany({ select: { id: true, name: true, code: true, email: true } });
  console.log('Schools in DB:', schools);
  
  const teachers = await prisma.teacher.findMany({ select: { id: true, name: true, email: true, schoolId: true }, take: 10 });
  console.log('Teachers in DB (first 10):', teachers);

  const admins = await prisma.admin.findMany({ select: { id: true, name: true, email: true, isSuperAdmin: true } });
  console.log('Admins in DB:', admins);
}

main().catch(console.error).finally(() => prisma.$disconnect());
