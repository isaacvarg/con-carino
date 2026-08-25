import { prisma } from '#/lib/prisma'

const DEFAULT_PERSON_BG_COLOR = '#0d9488'
const DEFAULT_PERSON_TEXT_COLOR = '#ffffff'

async function ensureFamilyTypeId(): Promise<string> {
  const type = await prisma.carePersonType.upsert({
    where: { name: 'Family' },
    create: { name: 'Family', isPaid: false },
    update: {},
    select: { id: true },
  })
  return type.id
}

function personNameFromUser(user: {
  name?: string | null
  email?: string | null
}): string {
  const name = user.name?.trim()
  if (name) return name
  const email = user.email?.trim()
  if (email) {
    const local = email.split('@')[0]?.trim()
    if (local) return local
  }
  return 'Family member'
}

/**
 * Idempotent: every app user gets a linked CarePerson (Family type by default).
 *
 * If an admin pre-created an offline person and declared the email they
 * expect that person to sign in with, link this user to that record instead
 * of creating a second one — this is the case that otherwise produces the
 * duplicate-person mess Merge exists to clean up.
 */
export async function ensureCarePersonForUser(user: {
  id: string
  name?: string | null
  email?: string | null
}): Promise<void> {
  const existing = await prisma.carePerson.findUnique({
    where: { userId: user.id },
    select: { id: true },
  })
  if (existing) return

  const email = user.email?.trim().toLowerCase()
  if (email) {
    const expected = await prisma.carePerson.findFirst({
      where: { userId: null, archivedAt: null, email },
      select: { id: true },
    })
    if (expected) {
      await prisma.carePerson.update({
        where: { id: expected.id },
        data: { userId: user.id },
      })
      return
    }
  }

  const typeId = await ensureFamilyTypeId()
  await prisma.carePerson.create({
    data: {
      name: personNameFromUser(user),
      userId: user.id,
      typeId,
      bgColor: DEFAULT_PERSON_BG_COLOR,
      textColor: DEFAULT_PERSON_TEXT_COLOR,
      isActive: true,
    },
  })
}
