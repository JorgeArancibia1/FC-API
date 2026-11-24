// Verifica que el replica set local esté en PRIMARY usando el driver de Prisma.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    const n = await prisma.user.count();
    console.log('OK: conectado al replica set. User count =', n);
  } catch (e) {
    console.log('FALLO:', e.message.split('\n').slice(0, 4).join(' | '));
  } finally {
    await prisma.$disconnect();
  }
})();
