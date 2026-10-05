import { http, HttpResponse } from 'msw'
import { seedCues, seedMovers, seedProject, type Cue, type Department, type Receipt } from '../stores/workshop'

/**
 * 服务端（MSW 模拟）保存权威回执：
 * - 每个 (提示, 版本, 部门) 槽位只允许一份“有效”回执，先到者生效
 * - seq 全局单调递增，用来给并发提交排序
 * - clientId 幂等：断网重传同一回执只返回已有记录（200），不新增
 * - 提示内容同步（/api/sync）只取本地版本，回执按 id 合并，不丢历史
 */

let cues: Cue[] = structuredClone(seedCues)
let seq = 100
let failNext = false

function findCue(id: string) {
  return cues.find((cue) => cue.id === id)
}

function findEffectiveSlot(cue: Cue, department: Department, version: number) {
  return cue.receipts.find((item) => item.state === '有效' && item.department === department && item.version === version)
}

function fresh() {
  return cues.map((cue) => ({
    ...cue,
    conflict: cue.id === 'C-06' ? '此提示与道具运输时间重叠 4 分钟' : '',
  }))
}

export const handlers = [
  http.get('/api/project', () => HttpResponse.json(seedProject)),

  http.get('/api/cues', () => HttpResponse.json(fresh())),

  http.post('/api/cues/:id/comments', async ({ params, request }) => {
    const body = (await request.json()) as { author: string; content: string }
    const cue = findCue(params.id as string)
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

  /** 部门回执提交 */
  http.post('/api/cues/:id/receipts', async ({ params, request }) => {
    if (failNext) {
      failNext = false
      return HttpResponse.json({ message: '模拟网络故障' }, { status: 503 })
    }

    const body = (await request.json()) as {
      version: number
      department: Department
      operator: string
      clientId: string
    }
    const cue = findCue(params.id as string)
    if (!cue) return new HttpResponse(null, { status: 404 })
    if (!cue.issuedAt) {
      return HttpResponse.json({ message: '提示尚未发放，无法回执' }, { status: 400 })
    }

    // 版本失效：提示已改版，提交方看到的是旧版本
    if (body.version !== cue.version) {
      return HttpResponse.json(
        {
          outcome: 'stale-version',
          reason: `提示已更新到 v${cue.version}，你确认的是 v${body.version}，旧版本回执未生效`,
          cue,
        },
        { status: 409 },
      )
    }

    // 幂等重传：同一 clientId 只算一次
    const byClient = cue.receipts.find((item) => item.clientId === body.clientId && body.clientId)
    if (byClient) {
      return HttpResponse.json({ outcome: 'identical', receipt: byClient, cue }, { status: 200 })
    }

    // 同槽位并发：先到者生效，后到者看到已生效版本
    const existing = findEffectiveSlot(cue, body.department, body.version)
    if (existing) {
      return HttpResponse.json(
        {
          outcome: 'duplicate-slot',
          reason: `${body.department} 已在 ${existing.submittedAt} 由 ${existing.operator} 确认当前版本`,
          receipt: existing,
          cue,
        },
        { status: 409 },
      )
    }

    const receipt: Receipt = {
      id: `r-srv-${seq}`,
      cueId: cue.id,
      version: body.version,
      department: body.department,
      operator: body.operator,
      submittedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
      state: '有效',
      seq: seq++,
      clientId: body.clientId,
    }
    cue.receipts.push(receipt)
    return HttpResponse.json({ outcome: 'created', receipt, cue }, { status: 201 })
  }),

  /** 内容同步：以客户端内容为准，但回执按 id 与服务端合并，重复只留一条 */
  http.post('/api/sync', async ({ request }) => {
    if (failNext) {
      failNext = false
      return HttpResponse.json({ message: '模拟网络故障' }, { status: 503 })
    }

    const body = (await request.json()) as { cues: Cue[] }
    const incoming = Array.isArray(body.cues) ? body.cues : []
    const merged: Cue[] = incoming.map((clientCue) => {
      const serverCue = findCue(clientCue.id)
      if (!serverCue) return clientCue
      const byId = new Map<string, Receipt>()
      serverCue.receipts.forEach((item) => byId.set(item.id, item))
      clientCue.receipts.forEach((item) => {
        if (!byId.has(item.id)) byId.set(item.id, item)
      })
      return { ...clientCue, receipts: [...byId.values()].sort((a, b) => a.seq - b.seq) }
    })

    cues = merged
    return HttpResponse.json({
      syncedAt: new Date().toISOString(),
      revision: Date.now(),
      cues,
    })
  }),

  /** 让下一次提交/同步失败，用于演示重试保留原队列 */
  http.post('/api/debug/fail-next', () => {
    failNext = true
    return HttpResponse.json({ armed: true })
  }),
]

export { seedMovers }
