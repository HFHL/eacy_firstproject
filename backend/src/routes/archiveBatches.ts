import { Router, Request, Response } from 'express'
import db from '../db.js'
import { buildArchiveMatchGroups } from '../services/archiveMatching.js'

const router = Router({ mergeParams: true })

router.get('/groups', (req: Request, res: Response) => {
  const batchId = (req.query.batchId as string) || null
  const includeArchived = req.query.includeArchived === 'true'
  const includeRawDocuments = req.query.includeRawDocuments !== 'false'

  let docs: any[]
  if (batchId) {
    docs = db.prepare(`SELECT * FROM documents WHERE batch_id = ? AND status != 'deleted'`).all(batchId) as any[]
  } else {
    docs = db.prepare(`SELECT * FROM documents WHERE meta_status = 'completed' AND status != 'deleted'`).all() as any[]
  }

  const targetDocs = docs.filter((doc) => includeArchived || doc.status !== 'archived')
  const archivedCount = docs.filter((doc) => doc.status === 'archived').length
  const pendingCount = docs.filter((doc) => doc.status !== 'archived').length
  const allPatients = db.prepare(`SELECT * FROM patients`).all() as any[]
  const responseGroups = buildArchiveMatchGroups(targetDocs, allPatients, { includeRawDocuments })

  res.json({
     summary: {
       batchId: batchId ?? null,
       totalDocuments: docs.length,
       groupCount: responseGroups.length,
       archivedCount,
       pendingCount
     },
     groups: responseGroups
  });
});

export default router;
