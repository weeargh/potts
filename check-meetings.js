const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('Checking meetings in database...\n')
  
  const meetings = await prisma.meeting.findMany({
    select: {
      id: true,
      botId: true,
      botName: true,
      userId: true,
      status: true,
      createdAt: true
    },
    take: 10,
    orderBy: { createdAt: 'desc' }
  })
  
  console.log(`Total meetings found: ${meetings.length}\n`)
  meetings.forEach(m => {
    console.log(`- ${m.botName} (${m.status})`)
    console.log(`  Bot ID: ${m.botId}`)
    console.log(`  User ID: ${m.userId}`)
    console.log(`  Created: ${m.createdAt}\n`)
  })
  
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true
    }
  })
  
  console.log(`\nUsers in database: ${users.length}`)
  users.forEach(u => {
    console.log(`- ${u.email} (${u.id})`)
  })
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
