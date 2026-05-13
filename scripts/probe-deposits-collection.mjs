import fs from 'node:fs'
import path from 'node:path'
import admin from 'firebase-admin'

const sa = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf8'))
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id })
const db = admin.firestore()

const cnt = await db.collection('deposits').count().get()
console.log('deposits total count:', cnt.data().count)

const some = await db.collection('deposits').limit(5).get()
some.forEach((d) => console.log('  ', d.id, '->', d.data()))

process.exit(0)
