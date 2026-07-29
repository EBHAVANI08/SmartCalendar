import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.admin.upsert({
    where: { email: 'admin@school.com' },
    update: {},
    create: { name: 'School Admin', email: 'admin@school.com', password: 'admin123' },
  });
  console.log('Admin ready:', admin.email);

  const count = await prisma.teacher.count();
  console.log('Teachers in DB:', count);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
