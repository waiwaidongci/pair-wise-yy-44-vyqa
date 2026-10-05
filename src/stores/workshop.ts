import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import axios from 'axios'

export type Department = '舞台' | '灯光' | '音响' | '道具'
export type Point = { x: number; y: number }
export type CueStatus = '草稿' | '待确认' | '已确认'
export type ReceiptStatus = '未发放' | '待确认' | '已确认'

export type Comment = {
  id: string
  author: string
  content: string
  createdAt: string
  resolved: boolean
}

export type Cue = {
  id: string
  act: string
  scene: string
  time: string
  title: string
  department: Department
  owner: string
  duration: number
  entry: Point
  exit: Point
  route: Point[]
  note: string
  status: CueStatus
  /** 内容版本号：时间/路线/执行部门等内容变更时自增，旧回执据此作废 */
  version: number
  /** 需要收齐回执的执行部门 */
  distributeTo: Department[]
  comments: Comment[]
}

export type Receipt = {
  cueId: string
  department: Department
  status: ReceiptStatus
  /** 已确认的提示版本；与 cue.version 一致才视为当前版本已收讫 */
  confirmedVersion: number | null
  confirmedAt: string | null
  confirmedBy: string | null
}

type SyncItem = {
  key: string
  cueId: string
  department: Department
  version: number
  confirmedBy: string
  createdAt: string
}

export const seedProject = {
  name: '潮汐来信',
  venue: '上海大剧院 · 大剧场',
  rehearsalDate: '2026-10-08',
  company: '远岸剧团',
}

export const seedMovers = [
  { id: 'M-01', alias: '林默', role: '父亲', group: '主要演员', color: '#d96b45' },
  { id: 'M-02', alias: '周予', role: '女儿', group: '主要演员', color: '#2f8d88' },
  { id: 'M-03', alias: '顾川', role: '灯塔守望者', group: '主要演员', color: '#4f6fb0' },
  { id: 'M-04', alias: '群演甲组', role: '旅客', group: '群演', color: '#ba8c2f' },
  { id: 'M-05', alias: '群演乙组', role: '码头工人', group: '群演', color: '#735ca8' },
]

export const seedCues: Cue[] = [
  {
    id: 'C-01',
    act: '第一幕',
    scene: '启航前夜',
    time: '00:04:20',
    title: '林默从左侧门入场',
    department: '舞台',
    owner: '林默 / 周予',
    duration: 95,
    entry: { x: 10, y: 70 },
    exit: { x: 64, y: 38 },
    route: [{ x: 10, y: 70 }, { x: 35, y: 60 }, { x: 64, y: 38 }],
    note: '灯位切换后 2 秒入场，停在码头箱前。',
    status: '已确认',
    version: 1,
    distributeTo: ['舞台'],
    comments: [
      { id: 'c1', author: '王灯控', content: '面光需要延长 4 秒，保证转身动作可见。', createdAt: '2026-09-27 14:20', resolved: false },
    ],
  },
  {
    id: 'C-02',
    act: '第一幕',
    scene: '启航前夜',
    time: '00:06:10',
    title: '信件道具交接',
    department: '道具',
    owner: '周予 / 道具组',
    duration: 40,
    entry: { x: 28, y: 30 },
    exit: { x: 55, y: 47 },
    route: [{ x: 28, y: 30 }, { x: 44, y: 40 }, { x: 55, y: 47 }],
    note: '使用 B 版信封，背台侧完成交接。',
    status: '待确认',
    version: 1,
    distributeTo: ['道具'],
    comments: [],
  },
  {
    id: 'C-03',
    act: '第二幕',
    scene: '风暴',
    time: '00:21:35',
    title: '升降台上升 / 码头位移',
    department: '舞台',
    owner: '舞台机械',
    duration: 120,
    entry: { x: 72, y: 82 },
    exit: { x: 42, y: 50 },
    route: [{ x: 72, y: 82 }, { x: 60, y: 70 }, { x: 42, y: 50 }],
    note: '先确认演员离开危险半径，再启动升降台。',
    status: '草稿',
    version: 1,
    distributeTo: [],
    comments: [],
  },
  {
    id: 'C-04',
    act: '第二幕',
    scene: '风暴',
    time: '00:23:05',
    title: '爆闪与低频重音',
    department: '灯光',
    owner: '王灯控 / 声场',
    duration: 18,
    entry: { x: 50, y: 12 },
    exit: { x: 50, y: 12 },
    route: [{ x: 50, y: 12 }],
    note: '与机械动作互锁，机械未到位禁止触发。',
    status: '待确认',
    version: 1,
    distributeTo: ['灯光', '音响'],
    comments: [],
  },
  {
    id: 'C-05',
    act: '第三幕',
    scene: '守望',
    time: '00:37:42',
    title: '三人灯塔调度',
    department: '舞台',
    owner: '主要演员组',
    duration: 70,
    entry: { x: 18, y: 82 },
    exit: { x: 82, y: 18 },
    route: [{ x: 18, y: 82 }, { x: 45, y: 66 }, { x: 68, y: 35 }, { x: 82, y: 18 }],
    note: '群演保持第二条对角线，不遮挡主视线。',
    status: '草稿',
    version: 1,
    distributeTo: [],
    comments: [],
  },
  {
    id: 'C-06',
    act: '第三幕',
    scene: '守望',
    time: '00:39:10',
    title: '救生艇推入',
    department: '道具',
    owner: '道具组 / 群演乙组',
    duration: 50,
    entry: { x: 88, y: 64 },
    exit: { x: 70, y: 44 },
    route: [{ x: 88, y: 64 }, { x: 80, y: 54 }, { x: 70, y: 44 }],
    note: '与演员横穿路线冲突，需调整优先权。',
    status: '待确认',
    version: 1,
    distributeTo: ['道具'],
    comments: [],
  },
]

/** 演示用种子回执：C-01 已收讫，C-02/C-04灯光 待确认，C-04音响/C-06 无回执（未发放） */
export const seedReceipts: Receipt[] = [
  { cueId: 'C-01', department: '舞台', status: '已确认', confirmedVersion: 1, confirmedAt: '2026-09-27 14:20', confirmedBy: '舞台监督 · 陈曦' },
  { cueId: 'C-02', department: '道具', status: '待确认', confirmedVersion: null, confirmedAt: null, confirmedBy: null },
  { cueId: 'C-04', department: '灯光', status: '待确认', confirmedVersion: null, confirmedAt: null, confirmedBy: null },
]

const STORAGE_KEY = 'stage-scheduler-draft-v2'

/** 旧数据迁移：补齐 version / distributeTo，缺失字段给默认值 */
function migrateCue(cue: Partial<Cue>): Cue {
  return {
    ...cue,
    version: cue.version ?? 1,
    distributeTo: cue.distributeTo ?? [cue.department ?? '舞台'],
  } as Cue
}

/** 内容字段：变更时需要作废旧回执 */
const CONTENT_KEYS = ['act', 'scene', 'time', 'title', 'department', 'owner', 'duration', 'entry', 'exit', 'route', 'note']

export const useWorkshopStore = defineStore('workshop', () => {
  const saved = localStorage.getItem(STORAGE_KEY)
  const restored = saved
    ? (JSON.parse(saved) as { cues?: Cue[]; revision?: number; receipts?: Receipt[]; outbox?: SyncItem[] })
    : null
  // 旧草稿没有回执 → 未发放；全新种子 → 附带演示回执
  const cues = ref<Cue[]>(restored?.cues?.length ? restored.cues.map(migrateCue) : structuredClone(seedCues))
  const receipts = ref<Receipt[]>(
    restored?.receipts ? restored.receipts : saved ? [] : structuredClone(seedReceipts),
  )
  const outbox = ref<SyncItem[]>(restored?.outbox ?? [])
  const selectedId = ref('C-01')
  const zoom = ref(100)
  const actFilter = ref('全部')
  const departmentFilter = ref('全部')
  const rev = ref(restored?.revision ?? 12)
  const revision = computed(() => `R${rev.value}`)
  const lastSaved = ref('刚刚自动保存')
  const isOffline = ref(false)
  const locked = ref(false)
  const undoStack = ref<Cue[][]>([])
  const redoStack = ref<Cue[][]>([])
  const syncState = ref<'idle' | 'syncing' | 'error'>('idle')
  const lastSyncAt = ref<string | null>(null)

  const currentUser = '舞台监督 · 陈曦'

  const selectedCue = computed(() => cues.value.find((cue) => cue.id === selectedId.value) ?? cues.value[0])
  const filteredCues = computed(() =>
    cues.value.filter(
      (cue) =>
        (actFilter.value === '全部' || cue.act === actFilter.value) &&
        (departmentFilter.value === '全部' || cue.department === departmentFilter.value),
    ),
  )
  const conflicts = computed(() =>
    cues.value.filter((cue, index) =>
      cues.value.some((other, otherIndex) => otherIndex !== index && other.time === cue.time && other.scene === cue.scene),
    ),
  )

  /* ---------- 回执查询 ---------- */

  function receiptFor(cueId: string, department: Department): Receipt | undefined {
    return receipts.value.find((r) => r.cueId === cueId && r.department === department)
  }

  /** 回执有效状态：无回执 → 未发放；确认版本与提示版本一致 → 已确认；否则待确认 */
  function receiptStatus(cue: Cue, department: Department): ReceiptStatus {
    const r = receiptFor(cue.id, department)
    if (!r) return '未发放'
    if (r.confirmedVersion === cue.version) return '已确认'
    return '待确认'
  }

  /** 提示聚合状态：未发放任何部门 → 草稿；收齐当前版本 → 已确认；否则待确认 */
  function cueStatus(cue: Cue): CueStatus {
    if (cue.distributeTo.length === 0) return '草稿'
    return cue.distributeTo.every((d) => receiptStatus(cue, d) === '已确认') ? '已确认' : '待确认'
  }

  function pendingReceipts(cue: Cue): Department[] {
    return cue.distributeTo.filter((d) => receiptStatus(cue, d) !== '已确认')
  }

  /** 全部提示都已收齐当前版本回执（基线/打印的准入条件） */
  const allReceiptsCurrent = computed(() => cues.value.every((cue) => cueStatus(cue) === '已确认'))
  const pendingCues = computed(() => cues.value.filter((cue) => cueStatus(cue) !== '已确认'))

  /* ---------- 离线队列 ---------- */

  const outboxCount = computed(() => outbox.value.length)
  const isSyncing = computed(() => syncState.value === 'syncing')

  function isPendingSync(cueId: string, department: Department): boolean {
    return outbox.value.some((it) => it.cueId === cueId && it.department === department)
  }

  function applyReceipt(r: Receipt) {
    const idx = receipts.value.findIndex((x) => x.cueId === r.cueId && x.department === r.department)
    if (idx >= 0) receipts.value[idx] = { ...r }
    else receipts.value.push({ ...r })
  }

  /** 入队：按 提示+部门 去重，重复补传只留一次（同 key 保留最新） */
  function enqueue(item: Omit<SyncItem, 'key' | 'createdAt'>) {
    const key = `${item.cueId}:${item.department}`
    const syncItem: SyncItem = { ...item, key, createdAt: new Date().toISOString() }
    const existingIdx = outbox.value.findIndex((it) => it.key === key)
    if (existingIdx >= 0) outbox.value[existingIdx] = syncItem
    else outbox.value.push(syncItem)
  }

  /* ---------- 回执确认 ---------- */

  /**
   * 确认某部门已收讫当前版本提示。
   * 在线：提交服务端，先到者生效，后到者看到已生效版本；
   * 离线 / 网络失败：进入离线队列，回网后合并补传。
   */
  async function confirmReceipt(cueId: string, department: Department, confirmer: string = currentUser) {
    const cue = cues.value.find((c) => c.id === cueId)
    if (!cue || locked.value) return { ok: false as const }
    if (!receiptFor(cueId, department)) {
      receipts.value.push({ cueId, department, status: '待确认', confirmedVersion: null, confirmedAt: null, confirmedBy: null })
    }
    if (isOffline.value) {
      enqueue({ cueId, department, version: cue.version, confirmedBy: confirmer })
      return { ok: true as const, queued: true as const }
    }
    try {
      const res = await axios.post(`/api/cues/${cueId}/receipts`, {
        department,
        version: cue.version,
        confirmedBy: confirmer,
      })
      applyReceipt(res.data.receipt as Receipt)
      if (res.data.alreadyConfirmed) return { ok: true as const, alreadyConfirmed: true as const }
      return { ok: true as const }
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        const data = err.response.data as { receipt?: Receipt }
        if (data.receipt) applyReceipt(data.receipt)
        return { ok: true as const, conflict: true as const }
      }
      // 网络失败：保留原队列，稍后重试
      enqueue({ cueId, department, version: cue.version, confirmedBy: confirmer })
      return { ok: true as const, queued: true as const, offline: true as const }
    }
  }

  /** 发放提示到指定部门（建立待确认回执） */
  function distributeCue(cueId: string, department: Department) {
    const cue = cues.value.find((c) => c.id === cueId)
    if (!cue || locked.value) return
    if (!cue.distributeTo.includes(department)) {
      cue.distributeTo.push(department)
      rev.value += 1
    }
    if (!receiptFor(cueId, department)) {
      receipts.value.push({ cueId, department, status: '待确认', confirmedVersion: null, confirmedAt: null, confirmedBy: null })
    }
  }

  /**
   * 回网后批量同步离线回执：按 提示+部门 合并去重。
   * 失败时保留原队列，重试从未确认项继续（已处理项已移除）。
   */
  async function syncReceipts() {
    if (!outbox.value.length) return { ok: true as const, synced: 0, conflicts: 0, deduped: 0 }
    syncState.value = 'syncing'
    const items = [...outbox.value]
    try {
      const res = await axios.post('/api/sync/receipts', { receipts: items })
      const {
        synced = [],
        conflicts = [],
        deduped = [],
        receipts: serverReceipts = [],
      } = res.data as { synced?: string[]; conflicts?: string[]; deduped?: string[]; receipts?: Receipt[] }
      const doneKeys = new Set([...synced, ...conflicts, ...deduped])
      // 仅移除已处理项；冲突项为过期版本不再重试；网络失败则整队保留
      outbox.value = outbox.value.filter((it) => !doneKeys.has(it.key))
      serverReceipts.forEach(applyReceipt)
      syncState.value = 'idle'
      lastSyncAt.value = new Date().toISOString()
      return { ok: true as const, synced: synced.length, conflicts: conflicts.length, deduped: deduped.length }
    } catch (err) {
      syncState.value = 'error'
      return { ok: false as const, error: err }
    }
  }

  /** 启动时从服务端拉取权威回执（旧数据无回执 → 未发放） */
  async function hydrate() {
    if (isOffline.value) return
    try {
      const res = await axios.get('/api/cues')
      const serverCues = res.data as Array<Cue & { receipts?: Receipt[] }>
      serverCues.flatMap((c) => c.receipts ?? []).forEach(applyReceipt)
    } catch {
      /* 离线或服务不可用时沿用本地数据 */
    }
  }

  /* ---------- 基线 ---------- */

  /** 锁定基线：未收齐当前版本回执则拒绝，不进入基线 */
  function lockBaseline() {
    const pending = pendingCues.value
    if (pending.length) return { ok: false as const, pending }
    locked.value = true
    rev.value += 1
    return { ok: true as const, pending: [] }
  }

  function unlockBaseline() {
    locked.value = false
    rev.value += 1
  }

  function toggleOffline() {
    isOffline.value = !isOffline.value
    if (!isOffline.value) {
      // 回网后自动补传离线回执
      void syncReceipts()
    }
  }

  /* ---------- 编辑 ---------- */

  watch(
    [cues, receipts, outbox, rev, isOffline],
    () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ cues: cues.value, receipts: receipts.value, outbox: outbox.value, revision: rev.value }),
      )
      lastSaved.value = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    },
    { deep: true },
  )

  function snapshot() {
    undoStack.value.push(structuredClone(cues.value))
    if (undoStack.value.length > 20) undoStack.value.shift()
    redoStack.value = []
  }

  function updateCue(patch: Partial<Cue>, addRevision = true) {
    if (locked.value) return
    snapshot()
    const index = cues.value.findIndex((cue) => cue.id === selectedId.value)
    if (index < 0) return
    const contentChanged = Object.keys(patch).some((k) => CONTENT_KEYS.includes(k))
    cues.value[index] = { ...cues.value[index], ...patch }
    if (contentChanged) {
      // 提示内容一变，对应旧回执作废并回到待确认
      cues.value[index].version += 1
      receipts.value.forEach((r) => {
        if (r.cueId === cues.value[index].id) r.status = '待确认'
      })
    }
    if (addRevision) rev.value += 1
  }

  function addWaypoint(point: { x: number; y: number }) {
    const cue = selectedCue.value
    if (!cue) return
    updateCue({ route: [...cue.route, point] })
  }

  function addCue() {
    if (locked.value) return
    snapshot()
    const next = cues.value.length + 1
    const cue: Cue = {
      id: `C-${String(next).padStart(2, '0')}`,
      act: '第一幕',
      scene: '新场景',
      time: '00:00:00',
      title: '新执行提示',
      department: '舞台',
      owner: '待指派',
      duration: 30,
      entry: { x: 10, y: 50 },
      exit: { x: 90, y: 50 },
      route: [{ x: 10, y: 50 }, { x: 90, y: 50 }],
      note: '',
      status: '草稿',
      version: 1,
      distributeTo: [],
      comments: [],
    }
    cues.value.push(cue)
    selectedId.value = cue.id
    rev.value += 1
  }

  function undo() {
    const previous = undoStack.value.pop()
    if (!previous) return
    redoStack.value.push(structuredClone(cues.value))
    cues.value = previous
    rev.value += 1
  }

  function redo() {
    const next = redoStack.value.pop()
    if (!next) return
    undoStack.value.push(structuredClone(cues.value))
    cues.value = next
    rev.value += 1
  }

  function addComment(content: string, author = '当前用户') {
    const cue = selectedCue.value
    if (!cue) return
    snapshot()
    cue.comments.push({
      id: `local-${Date.now()}`,
      author,
      content,
      createdAt: new Date().toLocaleString('zh-CN'),
      resolved: false,
    })
    rev.value += 1
  }

  function toggleComment(commentId: string) {
    const comment = selectedCue.value?.comments.find((item) => item.id === commentId)
    if (comment) comment.resolved = !comment.resolved
  }

  return {
    cues,
    receipts,
    outbox,
    selectedId,
    selectedCue,
    filteredCues,
    conflicts,
    zoom,
    actFilter,
    departmentFilter,
    revision,
    lastSaved,
    isOffline,
    locked,
    syncState,
    lastSyncAt,
    currentUser,
    canUndo: computed(() => undoStack.value.length > 0),
    canRedo: computed(() => redoStack.value.length > 0),
    allReceiptsCurrent,
    pendingCues,
    outboxCount,
    isSyncing,
    receiptFor,
    receiptStatus,
    cueStatus,
    pendingReceipts,
    isPendingSync,
    confirmReceipt,
    distributeCue,
    syncReceipts,
    hydrate,
    updateCue,
    addWaypoint,
    addCue,
    undo,
    redo,
    addComment,
    toggleComment,
    lockBaseline,
    unlockBaseline,
    toggleOffline,
  }
})
