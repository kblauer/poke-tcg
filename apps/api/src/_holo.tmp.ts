import { prisma } from '@poke-tcg/db';
const rows = await prisma.card.findMany({ where: { id: { startsWith: 'ex1-106-holo-' } }, select: { id: true, data: true } });
for (const r of rows.sort((a, b) => a.id.localeCompare(b.id))) console.log(r.id.padEnd(32), JSON.stringify((r.data as { holoEnergy?: unknown }).holoEnergy));
await prisma.$disconnect();
