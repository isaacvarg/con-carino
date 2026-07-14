import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
})
const prisma = new PrismaClient({ adapter })

async function main() {
  await prisma.careSettings.upsert({
    where: { id: 'default' },
    create: { id: 'default', lovedOneName: '' },
    update: {},
  })

  await prisma.carePersonType.upsert({
    where: { name: 'Family' },
    create: {
      name: 'Family',
      isPaid: false,
      defaultHourlyRate: null,
    },
    update: {},
  })

  await prisma.carePersonType.upsert({
    where: { name: 'Employee' },
    create: {
      name: 'Employee',
      isPaid: true,
      defaultHourlyRate: 25,
    },
    update: {},
  })
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })
