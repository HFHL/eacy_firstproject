type MatchStatus =
  | 'matched_existing'
  | 'needs_confirmation'
  | 'new_patient_candidate'
  | 'insufficient_info'

type MatchConfidence = 'high' | 'medium' | 'low'

interface DocumentIdentityInfo {
  doc: any
  docId: string
  identifierSet: Set<string>
  identifiersList: string[]
  name: string
  gender: string
  age: string
  birthDate: string
  hospital: string
  department: string
  phone: string
  address: string
  rawResult: Record<string, any>
}

interface PatientIdentityInfo {
  id: string
  name: string
  identifiers: Set<string>
  gender: string
  age: string
  birthDate: string
  phone: string
  address: string
}

interface MatchCandidate {
  patientId: string
  name: string
  patient_code: string
  score: number
  similarity: number
  reason: string
  match_reasoning: string
  key_evidence: string[]
  concerns: string[]
  gender: string
  age: string
}

interface MatchGroupDocument {
  id: string
  fileName: string
  docType: string | null
  docSubType: string | null
  docTitle: string | null
  effectiveAt: string | null
  status: string | null
  patientId: string | null
}

export interface ArchiveMatchGroup {
  groupId: string
  displayName: string
  status: MatchStatus
  confidence: MatchConfidence
  groupReason: string
  matchReason: string
  identifiers: string[]
  patientSnapshot: {
    name: string | null
    gender: string | null
    age: string | null
    birthDate: string | null
    hospital: string | null
    department: string | null
  }
  documents: MatchGroupDocument[]
  candidatePatients: MatchCandidate[]
  matched_patient_id: string | null
}

function normalizeString(value: unknown): string {
  if (value == null) return ''
  return String(value).trim()
}

function safeParseJsonObject(input: unknown): Record<string, any> {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return input as Record<string, any>
  }
  if (typeof input !== 'string' || input.trim() === '') {
    return {}
  }
  try {
    const parsed = JSON.parse(input)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function extractIdentifierValues(rawIdentifiers: unknown): string[] {
  if (!Array.isArray(rawIdentifiers)) return []
  const out = new Set<string>()
  for (const item of rawIdentifiers) {
    if (typeof item === 'string' || typeof item === 'number') {
      const value = normalizeString(item)
      if (value) out.add(value)
      continue
    }
    if (!item || typeof item !== 'object') continue
    const obj = item as Record<string, any>
    const value = normalizeString(
      obj.value
      ?? obj.id
      ?? obj.identifier
      ?? obj['标识符编号']
      ?? obj['编号']
    )
    if (value) out.add(value)
  }
  return Array.from(out)
}

function getDocumentResult(doc: any): Record<string, any> {
  const metadata = safeParseJsonObject(doc?.metadata)
  const result = metadata.result
  return result && typeof result === 'object' && !Array.isArray(result) ? result : metadata
}

function parseDocumentIdentity(doc: any): DocumentIdentityInfo {
  const result = getDocumentResult(doc)
  const identifiersList = extractIdentifierValues(result['唯一标识符'])

  return {
    doc,
    docId: String(doc.id),
    identifierSet: new Set(identifiersList),
    identifiersList,
    name: normalizeString(result['患者姓名']),
    gender: normalizeString(result['患者性别']),
    age: normalizeString(result['患者年龄']),
    birthDate: normalizeString(result['出生日期']),
    hospital: normalizeString(result['机构名称']),
    department: normalizeString(result['科室信息']),
    phone: normalizeString(result['联系电话']),
    address: normalizeString(result['地址'] ?? result['家庭住址']),
    rawResult: result,
  }
}

function parsePatientIdentity(row: any): PatientIdentityInfo {
  const metadata = safeParseJsonObject(row?.metadata)
  const identifiersList = [
    ...extractIdentifierValues(metadata.identifiers),
    ...extractIdentifierValues(metadata['唯一标识符']),
  ]

  return {
    id: String(row.id),
    name: normalizeString(row.name),
    identifiers: new Set(identifiersList),
    gender: normalizeString(metadata.gender ?? metadata['患者性别']),
    age: normalizeString(metadata.age ?? metadata['患者年龄']),
    birthDate: normalizeString(metadata.birthDate ?? metadata['出生日期']),
    phone: normalizeString(metadata.phone ?? metadata['联系电话']),
    address: normalizeString(metadata.address ?? metadata['地址']),
  }
}

function buildCandidate(
  patient: PatientIdentityInfo,
  score: number,
  reason: string,
  keyEvidence: string[],
  concerns: string[],
): MatchCandidate {
  return {
    patientId: patient.id,
    name: patient.name,
    patient_code: patient.id.slice(0, 8),
    score,
    similarity: score,
    reason,
    match_reasoning: reason,
    key_evidence: keyEvidence,
    concerns,
    gender: patient.gender,
    age: patient.age,
  }
}

export function buildArchiveMatchGroups(
  docs: any[],
  patientRows: any[],
  options: { includeRawDocuments?: boolean } = {},
): ArchiveMatchGroup[] {
  const includeRawDocuments = options.includeRawDocuments !== false
  const docInfos = (Array.isArray(docs) ? docs : []).map(parseDocumentIdentity)

  const parent = new Map<string, string>()
  const find = (id: string): string => {
    if (!parent.has(id)) parent.set(id, id)
    const current = parent.get(id)!
    if (current !== id) {
      parent.set(id, find(current))
    }
    return parent.get(id)!
  }
  const union = (left: string, right: string) => {
    const leftRoot = find(left)
    const rightRoot = find(right)
    if (leftRoot !== rightRoot) {
      parent.set(leftRoot, rightRoot)
    }
  }

  for (const info of docInfos) {
    if (!parent.has(info.docId)) {
      parent.set(info.docId, info.docId)
    }
  }

  for (let i = 0; i < docInfos.length; i += 1) {
    for (let j = i + 1; j < docInfos.length; j += 1) {
      const left = docInfos[i]
      const right = docInfos[j]

      let hasIdentifierMatch = false
      for (const identifier of left.identifierSet) {
        if (right.identifierSet.has(identifier)) {
          hasIdentifierMatch = true
          break
        }
      }

      if (hasIdentifierMatch) {
        union(left.docId, right.docId)
        continue
      }

      let weakScore = 0
      if (left.name && right.name && left.name === right.name) weakScore += 3
      if (left.birthDate && right.birthDate && left.birthDate === right.birthDate) weakScore += 3
      if (left.age && right.age && left.age === right.age) weakScore += 2
      if (left.gender && right.gender && left.gender === right.gender) weakScore += 1
      if (left.hospital && right.hospital && left.hospital === right.hospital) weakScore += 1
      if (left.department && right.department && left.department === right.department) weakScore += 1

      if (weakScore >= 5) {
        union(left.docId, right.docId)
      }
    }
  }

  const groupsMap = new Map<string, DocumentIdentityInfo[]>()
  for (const info of docInfos) {
    const root = find(info.docId)
    if (!groupsMap.has(root)) groupsMap.set(root, [])
    groupsMap.get(root)!.push(info)
  }

  const patients = (Array.isArray(patientRows) ? patientRows : []).map(parsePatientIdentity)
  const groups: ArchiveMatchGroup[] = []

  for (const [, groupDocs] of groupsMap.entries()) {
    const canonicalDocId = [...groupDocs]
      .map((groupDoc) => groupDoc.docId)
      .sort((left, right) => left.localeCompare(right))[0]
    const groupId = `group_${String(canonicalDocId || '').slice(0, 8)}`
    const identifierSet = new Set<string>()
    let groupName = ''
    let groupGender = ''
    let groupAge = ''
    let groupBirthDate = ''
    let groupHospital = ''
    let groupDepartment = ''

    for (const groupDoc of groupDocs) {
      groupDoc.identifiersList.forEach((value) => identifierSet.add(value))
      if (!groupName && groupDoc.name) groupName = groupDoc.name
      if (!groupGender && groupDoc.gender) groupGender = groupDoc.gender
      if (!groupAge && groupDoc.age) groupAge = groupDoc.age
      if (!groupBirthDate && groupDoc.birthDate) groupBirthDate = groupDoc.birthDate
      if (!groupHospital && groupDoc.hospital) groupHospital = groupDoc.hospital
      if (!groupDepartment && groupDoc.department) groupDepartment = groupDoc.department
    }

    const identifiers = Array.from(identifierSet)

    let groupReason = '单文档无需并组'
    if (groupDocs.length > 1) {
      let hasStrongMatch = false
      const matchedIdentifiers = new Set<string>()
      const weakReasons = new Set<string>()

      for (let i = 0; i < groupDocs.length; i += 1) {
        for (let j = i + 1; j < groupDocs.length; j += 1) {
          const left = groupDocs[i]
          const right = groupDocs[j]

          let identifierMatched = false
          for (const identifier of left.identifierSet) {
            if (right.identifierSet.has(identifier)) {
              identifierMatched = true
              matchedIdentifiers.add(identifier)
            }
          }

          if (identifierMatched) {
            hasStrongMatch = true
            continue
          }

          if (left.name && right.name && left.name === right.name) weakReasons.add('姓名')
          if (left.birthDate && right.birthDate && left.birthDate === right.birthDate) weakReasons.add('出生日期')
          if (left.age && right.age && left.age === right.age) weakReasons.add('年龄')
        }
      }

      if (hasStrongMatch) {
        groupReason = `文档之间唯一标识符重合：${Array.from(matchedIdentifiers).join('、')}`
      } else if (weakReasons.size > 0) {
        groupReason = `文档之间弱信息匹配：${Array.from(weakReasons).join('、')}相同`
      } else {
        groupReason = '文档之间弱信息匹配'
      }
    }

    const candidates: MatchCandidate[] = []
    let status: MatchStatus = 'insufficient_info'
    let confidence: MatchConfidence = 'low'
    let matchReason = ''

    for (const patient of patients) {
      let matchedIdentifier = ''
      for (const identifier of identifiers) {
        if (patient.identifiers.has(identifier)) {
          matchedIdentifier = identifier
          break
        }
      }

      if (matchedIdentifier) {
        candidates.push(
          buildCandidate(
            patient,
            95,
            `与已有患者唯一标识符重合：${matchedIdentifier}`,
            [`唯一标识符：${matchedIdentifier}`],
            [],
          ),
        )
        continue
      }

      let weakScore = 0
      const reasons: string[] = []
      if (groupName && patient.name && groupName === patient.name) {
        weakScore += 50
        reasons.push('姓名')
      }
      if (groupBirthDate && patient.birthDate && groupBirthDate === patient.birthDate) {
        weakScore += 20
        reasons.push('出生日期')
      }
      if (groupGender && patient.gender && groupGender === patient.gender) {
        weakScore += 10
        reasons.push('性别')
      }
      if (groupAge && patient.age && groupAge === patient.age) {
        weakScore += 10
        reasons.push('年龄')
      }

      if (weakScore >= 50) {
        candidates.push(
          buildCandidate(
            patient,
            weakScore,
            `弱信息匹配到已有患者：${reasons.join('、')}相同`,
            reasons,
            weakScore >= 90 ? [] : ['需人工确认'],
          ),
        )
      }
    }

    candidates.sort((left, right) => right.score - left.score)

    if (candidates.length > 0 && candidates[0].score >= 90) {
      status = 'matched_existing'
      confidence = 'high'
      matchReason = candidates[0].reason
    } else if (candidates.length > 0) {
      status = 'needs_confirmation'
      confidence = 'medium'
      matchReason = candidates.length > 1
        ? '匹配到多个候选患者，需人工选择'
        : `${candidates[0].reason}，需人工确认`
    } else if (groupName || identifiers.length > 0) {
      status = 'new_patient_candidate'
      confidence = 'medium'
      matchReason = '未匹配到现有患者，建议新建档'
    } else {
      status = 'insufficient_info'
      confidence = 'low'
      matchReason = '信息严重不足，无法匹配或建档'
    }

    let snapshotName = groupName
    let snapshotGender = groupGender
    let snapshotAge = groupAge
    let snapshotBirthDate = groupBirthDate

    if (candidates.length > 0) {
      const topPatient = patients.find((patient) => patient.id === candidates[0].patientId)
      if (topPatient) {
        if (!snapshotName) snapshotName = topPatient.name
        if (!snapshotGender) snapshotGender = topPatient.gender
        if (!snapshotAge) snapshotAge = topPatient.age
        if (!snapshotBirthDate) snapshotBirthDate = topPatient.birthDate
      }
    }

    let displayName = '未识别患者组'
    if (status === 'matched_existing' && candidates.length === 1) {
      displayName = candidates[0].name
    } else if (status === 'needs_confirmation') {
      if (groupName) displayName = `疑似：${groupName}`
      else if (candidates.length > 0) displayName = `待确认患者组（${candidates[0].name}）`
      else displayName = '待确认患者组'
    } else if (groupName) {
      displayName = groupName
    } else if (identifiers.length > 0) {
      displayName = `未知患者（${identifiers[0]}）`
    }

    groups.push({
      groupId,
      displayName,
      status,
      confidence,
      groupReason,
      matchReason,
      identifiers,
      patientSnapshot: {
        name: snapshotName || null,
        gender: snapshotGender || null,
        age: snapshotAge || null,
        birthDate: snapshotBirthDate || null,
        hospital: groupHospital || null,
        department: groupDepartment || null,
      },
      documents: includeRawDocuments
        ? groupDocs.map((groupDoc) => ({
            id: groupDoc.doc.id,
            fileName: groupDoc.doc.file_name,
            docType: groupDoc.doc.doc_type,
            docSubType: null,
            docTitle: groupDoc.doc.doc_title,
            effectiveAt: groupDoc.doc.effective_at,
            status: groupDoc.doc.status,
            patientId: groupDoc.doc.patient_id,
          }))
        : [],
      candidatePatients: candidates,
      matched_patient_id: candidates[0]?.patientId ?? null,
    })
  }

  return groups
}

export function buildArchiveMatchLookup(
  docs: any[],
  patientRows: any[],
): { groups: ArchiveMatchGroup[], byDocumentId: Map<string, ArchiveMatchGroup> } {
  const groups = buildArchiveMatchGroups(docs, patientRows, { includeRawDocuments: true })
  const byDocumentId = new Map<string, ArchiveMatchGroup>()
  for (const group of groups) {
    for (const doc of group.documents) {
      byDocumentId.set(doc.id, group)
    }
  }
  return { groups, byDocumentId }
}

export function mapGroupToFrontendTaskStatus(group: ArchiveMatchGroup | null, doc: any): string | null {
  if (!doc) return null
  if (doc.status === 'archived') return 'archived'
  if (!group) return null

  if (group.status === 'matched_existing') return 'auto_archived'
  if (group.status === 'needs_confirmation') return 'pending_confirm_review'
  if (group.status === 'new_patient_candidate') return 'pending_confirm_new'
  return 'pending_confirm_uncertain'
}
