import { http, HttpResponse } from 'msw'
import { seedCues, seedMovers, seedProject, seedReceipts } from '../stores/workshop'
import type { Cue, Receipt } from '../stores/workshop'

let cues: Cue[] = structuredClone(seedCues)
let receipts: Receipt[] = structuredClone(seedReceipts)

function receiptKey(r: { cueId: string; department: string }) {
  return `${r.cueId}:${r.department}`
}

export const handlers = [
  http.get('/api/project', () => HttpResponse.json(seedProject)),

  http.get('/api/cues', () =>
    HttpResponse.json(
      cues.map((cue) => ({
        ...cue,
        conflict: cue.id === 'C-06' ? '此提示与道具运输时间重叠 4 分钟' : '',
        receipts: receipts.filter((r) => r.cueId === cue.id),
      })),
    ),
  ),

  http.post('/api/cues/:id/comments', async ({ params, request }) => {
    const body = (await request.json()) as { author: string; content: string }
    const cue = cues.find((item) => item.id === params.id)
    if (!cue) return new HttpResponse(null, { status: 404 })
    cue.comments.push({
      id: `comment-${Date.now()}`,
      author: body.author,
      content: body.content,
      createdAt: new Date().toISOString(),
      resolved: false,
    })
    return HttpResponse.json(cue, { status: 201 })
  }),

  /**
   * 单条回执确认（并发控制）：
   * - 先到者生效：已确认当前版本时幂等返回 200；
   * - 后到者看到已生效版本：版本不一致返回 409 + 当前权威回执。
   */
  http.post('/api/cues/:id/receipts', async ({ params, request }) => {
    const body = (await request.json()) as { department: string; version: number; confirmedBy: string }
    const cue = cues.find((item) => item.id === params.id)
    if (!cue) return new HttpResponse(null, { status: 404 })
    if (cue.version !== body.version) {
      const current = receipts.find((r) => r.cueId === cue.id && r.department === body.department)
      return HttpResponse.json(
        { reason: 'version_conflict', cue, receipt: current ?? null },
        { status: 409 },
      )
    }
    let receipt = receipts.find((r) => r.cueId === cue.id && r.department === body.department)
    if (receipt && receipt.confirmedVersion === cue.version) {
      return HttpResponse.json({ receipt, alreadyConfirmed: true }, { status: 200 })
    }
    if (!receipt) {
      receipt = {
        cueId: cue.id,
        department: body.department as Receipt['department'],
        status: '已确认',
        confirmedVersion: cue.version,
        confirmedAt: new Date().toISOString(),
        confirmedBy: body.confirmedBy,
      }
      receipts.push(receipt)
    } else {
      receipt.status = '已确认'
      receipt.confirmedVersion = cue.version
      receipt.confirmedAt = new Date().toISOString()
      receipt.confirmedBy = body.confirmedBy
    }
    return HttpResponse.json({ receipt, alreadyConfirmed: false }, { status: 201 })
  }),

  /**
   * 离线回执批量补传：按 提示+部门 合并，重复补传只留一次。
   * 逐条返回处理结果，部分成功也回 200，客户端据此移除已处理项、保留失败项。
   */
  http.post('/api/sync/receipts', async ({ request }) => {
    const body = (await request.json()) as {
      receipts: Array<{
        key: string
        cueId: string
        department: string
        version: number
        confirmedBy: string
        createdAt: string
      }>
    }
    const synced: string[] = []
    const conflicts: string[] = []
    const deduped: string[] = []
    const applied: Receipt[] = []

    for (const item of body.receipts ?? []) {
      const cue = cues.find((c) => c.id === item.cueId)
      if (!cue || cue.version !== item.version) {
        conflicts.push(item.key)
        continue
      }
      let receipt = receipts.find((r) => r.cueId === item.cueId && r.department === item.department)
      if (receipt && receipt.confirmedVersion === cue.version) {
        deduped.push(item.key)
        continue
      }
      if (!receipt) {
        receipt = {
          cueId: item.cueId,
          department: item.department as Receipt['department'],
          status: '已确认',
          confirmedVersion: cue.version,
          confirmedAt: item.createdAt ?? new Date().toISOString(),
          confirmedBy: item.confirmedBy,
        }
        receipts.push(receipt)
      } else {
        receipt.status = '已确认'
        receipt.confirmedVersion = cue.version
        receipt.confirmedAt = item.createdAt ?? new Date().toISOString()
        receipt.confirmedBy = item.confirmedBy
      }
      synced.push(item.key)
      applied.push(receipt)
    }

    return HttpResponse.json({
      synced,
      conflicts,
      deduped,
      receipts: applied,
      syncedAt: new Date().toISOString(),
    })
  }),

  http.post('/api/sync', async ({ request }) => {
    const body = (await request.json()) as { cues: typeof cues }
    cues = structuredClone(body.cues)
    return HttpResponse.json({ syncedAt: new Date().toISOString(), revision: Date.now() })
  }),
]

export { seedMovers }
