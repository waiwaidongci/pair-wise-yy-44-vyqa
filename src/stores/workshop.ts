import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import axios from 'axios'

export type Department = '舞台' | '灯光' | '音响' | '道具'
export type Point = { x: number; y: number }
export const DEPARTMENTS: Department[] = ['舞台', '灯光', '音响', '道具']

export const DEPARTMENT_OPERATOR: Record<Department, string> = {
  舞台: '舞台监督 · 陈曦',
  灯光: '灯控 · 王岭',
  音响: '声场 · 李赫',
  道具: '道具组长 · 赵筏',
}

/** 新提示默认需要回执的部门：执行部门 + 一个交叉确认部门 */
const DEFAULT_RECEIVERS: Record<Department, Department[]> = {
  舞台: ['舞台', '灯光'],
  灯光: ['灯光', '音响'],
  音响: ['音响', '灯光'],
  道具: ['道具', '舞台'],
}

export type Comment = {
  id: string
  author: string
  content: string
  createdAt: string
  resolved: boolean
}

export type ReceiptState = '有效' | '已作废'

export type Receipt = {
  id: string
  cueId: string
  /** 回执针对的提示版本；提示改版后旧版本回执全部作废 */
  version: number
  department: Department
  operator: string
  submittedAt: string
  state: ReceiptState
  /** 服务端单调序号，用于并发时判断“先到者生效” */
  seq: number
  clientId?: string
}

export type IssueState = '未发放' | '待确认' | '已确认'
export type QueueStatus = '待发送' | '同步失败'

export type OutboundReceipt = {
  localId: string
  cueId: string
  department: Department
  /** 暂存时提示的版本，回网合并时用于识别失效回执 */
  clientVersion: number
  clientId: string
  queuedAt: string
  status: QueueStatus
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
  comments: Comment[]
  /** 提示内容版本，时间 / 路线 / 执行部门等内容一变即 +1 */
  version: number
  /** 必须收回回执的部门 */
  receivers: Department[]
  /** 首次发放时间；null 表示未发放 */
  issuedAt: string | null
  /** 已发放内容的指纹，用于识别“改了但还没发布”的内容 */
  publishedHash: string | null
  receipts: Receipt[]
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

function receipt(
  id: string,
  cueId: string,
  version: number,
  department: Department,
  submittedAt: string,
  state: ReceiptState,
  seq: number,
): Receipt {
  return { id, cueId, version, department, operator: DEPARTMENT_OPERATOR[department], submittedAt, state, seq }
}

function hashCue(cue: Cue): string {
  const payload = JSON.stringify({
    act: cue.act,
    scene: cue.scene,
    time: cue.time,
    title: cue.title,
    department: cue.department,
    owner: cue.owner,
    duration: cue.duration,
    entry: cue.entry,
    exit: cue.exit,
    route: cue.route,
    note: cue.note,
    receivers: cue.receivers,
  })
  let hash = 5381
  for (let i = 0; i < payload.length; i++) hash = (((hash << 5) + hash) ^ payload.charCodeAt(i)) >>> 0
  return hash.toString(16).padStart(8, '0')
}

function buildSeedCues(): Cue[] {
  const base: Array<Omit<Cue, 'publishedHash'>> = [
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
      route: [
        { x: 10, y: 70 },
        { x: 35, y: 60 },
        { x: 64, y: 38 },
      ],
      note: '灯位切换后 2 秒入场，停在码头箱前。',
      comments: [
        { id: 'c1', author: '王灯控', content: '面光需要延长 4 秒，保证转身动作可见。', createdAt: '2026-09-27 14:20', resolved: false },
      ],
      version: 1,
      receivers: ['舞台', '灯光'],
      issuedAt: '2026-09-26 10:02',
      receipts: [
        receipt('r-01', 'C-01', 1, '舞台', '2026-09-26 10:05', '有效', 1),
        receipt('r-02', 'C-01', 1, '灯光', '2026-09-26 10:09', '有效', 2),
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
      route: [
        { x: 28, y: 30 },
        { x: 44, y: 40 },
        { x: 55, y: 47 },
      ],
      note: '使用 B 版信封，背台侧完成交接。',
      comments: [],
      // 交接时间临时改过：R1 的两部门回执均已作废，R2 只收回了道具
      version: 2,
      receivers: ['道具', '音响'],
      issuedAt: '2026-09-26 11:00',
      receipts: [
        receipt('r-03', 'C-02', 1, '道具', '2026-09-26 11:12', '已作废', 3),
        receipt('r-04', 'C-02', 1, '音响', '2026-09-26 11:20', '已作废', 4),
        receipt('r-05', 'C-02', 2, '道具', '2026-09-28 09:40', '有效', 10),
      ],
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
      route: [
        { x: 72, y: 82 },
        { x: 60, y: 70 },
        { x: 42, y: 50 },
      ],
      note: '先确认演员离开危险半径，再启动升降台。',
      comments: [],
      version: 1,
      receivers: ['舞台', '灯光'],
      issuedAt: null,
      receipts: [],
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
      comments: [],
      version: 1,
      receivers: ['灯光', '音响'],
      issuedAt: '2026-09-27 15:00',
      receipts: [receipt('r-06', 'C-04', 1, '灯光', '2026-09-27 15:06', '有效', 5)],
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
      route: [
        { x: 18, y: 82 },
        { x: 45, y: 66 },
        { x: 68, y: 35 },
        { x: 82, y: 18 },
      ],
      note: '群演保持第二条对角线，不遮挡主视线。',
      comments: [],
      version: 1,
      receivers: ['舞台', '灯光'],
      issuedAt: null,
      receipts: [],
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
      route: [
        { x: 88, y: 64 },
        { x: 80, y: 54 },
        { x: 70, y: 44 },
      ],
      note: '与演员横穿路线冲突，需调整优先权。',
      comments: [],
      version: 1,
      receivers: ['道具', '舞台'],
      issuedAt: '2026-09-27 16:20',
      receipts: [
        receipt('r-07', 'C-06', 1, '道具', '2026-09-27 16:24', '有效', 6),
        receipt('r-08', 'C-06', 1, '舞台', '2026-09-27 16:27', '有效', 7),
      ],
    },
  ]

  return base.map((cue) => ({ ...cue, publishedHash: cue.issuedAt ? hashCue(cue as Cue) : null }))
}

export const seedCues: Cue[] = buildSeedCues()

/* ---------------------------------- 纯函数领域规则 ---------------------------------- */

/** 当前版本的有效回执 */
export function effectiveReceipts(cue: Cue): Receipt[] {
  return cue.receipts.filter((item) => item.state === '有效' && item.version === cue.version)
}

/** 当前版本还缺回执的部门 */
export function missingDepartments(cue: Cue): Department[] {
  const replied = new Set(effectiveReceipts(cue).map((item) => item.department))
  return cue.receivers.filter((department) => !replied.has(department))
}

/** 提示发放状态：未发放 / 待确认（部门未收齐）/ 已确认（当前版本全部收齐） */
export function cueIssueState(cue: Cue): IssueState {
  if (!cue.issuedAt) return '未发放'
  return missingDepartments(cue).length === 0 ? '已确认' : '待确认'
}

/** 已发放但内容有改动尚未发布（时间 / 路线 / 执行部门等） */
export function isCueDirty(cue: Cue): boolean {
  return cue.issuedAt !== null && cue.publishedHash !== hashCue(cue)
}

export function voidedReceipts(cue: Cue): Receipt[] {
  return cue.receipts
    .filter((item) => item.state === '已作废' || item.version !== cue.version)
    .sort((a, b) => b.seq - a.seq)
}

export function issueTagType(state: IssueState): 'info' | 'warning' | 'success' {
  return state === '已确认' ? 'success' : state === '待确认' ? 'warning' : 'info'
}

function nowText() {
  return new Date().toLocaleString('zh-CN', { hour12: false })
}

function randomId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

/* ---------------------------------- 持久化与迁移 ---------------------------------- */

const STORAGE_KEY = 'stage-scheduler-draft-v1'

type Persisted = {
  cues: Cue[]
  revision?: number
  locked?: boolean
  baselineAt?: string | null
  outbound?: OutboundReceipt[]
}

/** 旧数据没有版本 / 回执字段：按未发放显示，历史 status 字段废弃 */
function normalizeCue(raw: Record<string, unknown>): Cue {
  const fallbackDepartment = (raw.department as Department) ?? '舞台'
  const route = Array.isArray(raw.route) && raw.route.length ? (raw.route as Point[]) : [{ x: 10, y: 50 }, { x: 90, y: 50 }]
  const cue: Cue = {
    id: String(raw.id ?? 'C-XX'),
    act: String(raw.act ?? '第一幕'),
    scene: String(raw.scene ?? '新场景'),
    time: String(raw.time ?? '00:00:00'),
    title: String(raw.title ?? '新执行提示'),
    department: fallbackDepartment,
    owner: String(raw.owner ?? '待指派'),
    duration: Number(raw.duration ?? 30),
    entry: (raw.entry as Point) ?? route[0],
    exit: (raw.exit as Point) ?? route[route.length - 1],
    route,
    note: String(raw.note ?? ''),
    comments: Array.isArray(raw.comments) ? (raw.comments as Comment[]) : [],
    version: Number(raw.version ?? 1),
    receivers:
      Array.isArray(raw.receivers) && raw.receivers.length
        ? (raw.receivers as Department[])
        : DEFAULT_RECEIVERS[fallbackDepartment],
    issuedAt: typeof raw.issuedAt === 'string' ? raw.issuedAt : null,
    publishedHash: typeof raw.publishedHash === 'string' ? raw.publishedHash : null,
    receipts: Array.isArray(raw.receipts) ? (raw.receipts as Receipt[]) : [],
  }
  return cue
}

function restore(): Persisted | null {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (!saved) return null
  try {
    const parsed = JSON.parse(saved) as Persisted
    if (!Array.isArray(parsed.cues) || parsed.cues.length === 0) return null
    return { ...parsed, cues: parsed.cues.map((cue) => normalizeCue(cue as unknown as Record<string, unknown>)) }
  } catch {
    return null
  }
}

/* ---------------------------------- 服务端回执提交结果 ---------------------------------- */

export type SubmitOutcome =
  | { kind: 'created'; receipt: Receipt; cue: Cue }
  | { kind: 'identical'; receipt: Receipt; cue: Cue }
  | { kind: 'duplicate-slot'; receipt: Receipt; cue: Cue; department: Department }
  | { kind: 'stale-version'; submittedVersion: number; cue: Cue; department: Department }
  | { kind: 'not-issued' | 'locked' | 'network-error'; message: string }

export const useWorkshopStore = defineStore('workshop', () => {
  const restored = restore()
  const cues = ref<Cue[]>(restored?.cues?.length ? restored.cues : structuredClone(seedCues))
  const selectedId = ref('C-01')
  const zoom = ref(100)
  const actFilter = ref('全部')
  const departmentFilter = ref('全部')
  const rev = ref(restored?.revision ?? 12)
  const revision = computed(() => `R${rev.value}`)
  const lastSaved = ref('刚刚自动保存')
  const isOffline = ref(false)
  const locked = ref(restored?.locked ?? false)
  const baselineAt = ref<string | null>(restored?.baselineAt ?? null)
  const undoStack = ref<Cue[][]>([])
  const redoStack = ref<Cue[][]>([])
  const editing = ref(false)

  // 断网回执队列
  const outbound = ref<OutboundReceipt[]>(restored?.outbound ?? [])
  const flushing = ref(false)
  const flushMessage = ref('')
  const syncing = ref(false)
  const syncError = ref('')
  const lastSyncAt = ref('')
  const faultArmed = ref(false)

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

  const fullyConfirmedCues = computed(() => cues.value.filter((cue) => cueIssueState(cue) === '已确认'))
  const unissuedCues = computed(() => cues.value.filter((cue) => cueIssueState(cue) === '未发放'))
  const waitingCues = computed(() => cues.value.filter((cue) => cueIssueState(cue) === '待确认'))
  const missingSlotCount = computed(() => cues.value.reduce((sum, cue) => sum + missingDepartments(cue).length, 0))
  const baselineReady = computed(() => cues.value.length > 0 && missingSlotCount.value === 0 && unissuedCues.value.length === 0)
  const baselineBlockers = computed(() =>
    cues.value
      .map((cue): { cue: Cue; state: Exclude<IssueState, '已确认'>; missing: Department[] } | null => {
        const state = cueIssueState(cue)
        if (state === '已确认') return null
        return {
          cue,
          state,
          missing: state === '待确认' ? missingDepartments(cue) : cue.receivers,
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null),
  )

  watch(
    [cues, rev, locked, baselineAt, outbound],
    () => {
      const payload: Persisted = {
        cues: cues.value,
        revision: rev.value,
        locked: locked.value,
        baselineAt: baselineAt.value,
        outbound: outbound.value,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
      lastSaved.value = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    },
    { deep: true },
  )

  function findCue(id = selectedId.value) {
    return cues.value.find((cue) => cue.id === id)
  }

  function snapshot() {
    undoStack.value.push(structuredClone(cues.value))
    if (undoStack.value.length > 20) undoStack.value.shift()
    redoStack.value = []
  }

  /** 表单获得焦点时记一次撤销点，避免逐键输入塞满撤销栈 */
  function beginEdit() {
    if (locked.value || editing.value) return
    snapshot()
    editing.value = true
  }

  function endEdit() {
    editing.value = false
  }

  /** 实时写入内容（不升版本）；发布时才作废旧回执 */
  function editDraft(patch: Partial<Cue>) {
    if (locked.value) return
    const cue = findCue()
    if (!cue) return
    Object.assign(cue, patch)
  }

  function voidReceipts(cue: Cue) {
    cue.receipts.forEach((item) => {
      if (item.version === cue.version) item.state = '已作废'
    })
  }

  /** 已发放提示内容变更发布：版本 +1，旧回执作废，回到待确认 */
  function publishDraft(cueId = selectedId.value): boolean {
    const cue = findCue(cueId)
    if (!cue || locked.value || !cue.issuedAt) return false
    if (cue.publishedHash === hashCue(cue)) return false
    snapshot()
    cue.version += 1
    voidReceipts(cue)
    cue.publishedHash = hashCue(cue)
    rev.value += 1
    void syncCuesContent()
    return true
  }

  /** 发放提示：未发放 -> 待确认（版本固定为 R1） */
  function issueCue(cueId = selectedId.value): boolean {
    const cue = findCue(cueId)
    if (!cue || locked.value || cue.issuedAt) return false
    snapshot()
    cue.issuedAt = nowText()
    cue.publishedHash = hashCue(cue)
    rev.value += 1
    void syncCuesContent()
    return true
  }

  /** 调整回执部门；已发放提示改执行 / 回执部门时立即作废旧回执 */
  function setReceiver(department: Department, checked: boolean) {
    const cue = findCue()
    if (!cue || locked.value) return
    const next = checked
      ? Array.from(new Set([...cue.receivers, department]))
      : cue.receivers.filter((item) => item !== department)
    if (next.length === 0) return
    snapshot()
    cue.receivers = next
    if (cue.issuedAt) {
      cue.version += 1
      voidReceipts(cue)
      cue.publishedHash = hashCue(cue)
      rev.value += 1
      void syncCuesContent()
    }
  }

  function addWaypoint(point: Point) {
    const cue = selectedCue.value
    if (!cue || locked.value) return
    snapshot()
    cue.route = [...cue.route, point]
  }

  function addCue() {
    if (locked.value) return
    snapshot()
    const next = cues.value.length + 1
    const department: Department = '舞台'
    const cue: Cue = {
      id: `C-${String(next).padStart(2, '0')}`,
      act: '第一幕',
      scene: '新场景',
      time: '00:00:00',
      title: '新执行提示',
      department,
      owner: '待指派',
      duration: 30,
      entry: { x: 10, y: 50 },
      exit: { x: 90, y: 50 },
      route: [
        { x: 10, y: 50 },
        { x: 90, y: 50 },
      ],
      note: '',
      comments: [],
      version: 1,
      receivers: DEFAULT_RECEIVERS[department],
      issuedAt: null,
      publishedHash: null,
      receipts: [],
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
      createdAt: nowText(),
      resolved: false,
    })
    rev.value += 1
  }

  function toggleComment(commentId: string) {
    const comment = selectedCue.value?.comments.find((item) => item.id === commentId)
    if (comment) comment.resolved = !comment.resolved
  }

  /* ------------------------------ 基线 ------------------------------ */

  function lockBaseline(): { ok: boolean; blockers: typeof baselineBlockers.value } {
    if (locked.value) return { ok: true, blockers: [] }
    if (!baselineReady.value) return { ok: false, blockers: baselineBlockers.value }
    locked.value = true
    baselineAt.value = nowText()
    rev.value += 1
    return { ok: true, blockers: [] }
  }

  function unlockBaseline() {
    locked.value = false
    rev.value += 1
  }

  /* ------------------------------ 服务端合并 ------------------------------ */

  /** 服务端是回执的权威来源：按回执 id 合并，内容仍以本地为准 */
  function mergeServerCue(serverCue: Cue) {
    const local = findCue(serverCue.id)
    if (!local) return
    const merged = new Map<string, Receipt>()
    local.receipts.forEach((item) => merged.set(item.id, item))
    serverCue.receipts.forEach((item) => merged.set(item.id, item))
    local.receipts = [...merged.values()].sort((a, b) => a.seq - b.seq)
  }

  async function syncCuesContent(): Promise<boolean> {
    if (isOffline.value) return false
    syncing.value = true
    syncError.value = ''
    try {
      const { data } = await axios.post<{ syncedAt: string; revision: number; cues: Cue[] }>('/api/sync', {
        cues: cues.value,
      })
      if (Array.isArray(data.cues)) data.cues.forEach((serverCue) => mergeServerCue(serverCue))
      lastSyncAt.value = data.syncedAt
      return true
    } catch {
      syncError.value = '提示内容同步失败，本地修改已保留'
      return false
    } finally {
      syncing.value = false
    }
  }

  function postReceipt(cue: Cue, department: Department, clientId: string) {
    return axios.post<{ outcome: string; receipt: Receipt; cue: Cue; reason?: string }>(
      `/api/cues/${cue.id}/receipts`,
      {
        version: cue.version,
        department,
        operator: DEPARTMENT_OPERATOR[department],
        clientId,
      },
    )
  }

  /** 在线提交单个部门回执；并发安全由服务端按 (版本, 部门) 槽位保证 */
  async function submitReceiptOnline(
    cueId: string,
    department: Department,
    clientId = randomId('cli'),
  ): Promise<SubmitOutcome> {
    const cue = findCue(cueId)
    if (!cue) return { kind: 'not-issued', message: '提示不存在' }
    if (locked.value) return { kind: 'locked', message: '基线已锁定，不再接收回执' }
    if (!cue.issuedAt) return { kind: 'not-issued', message: '提示尚未发放' }

    try {
      const { status, data } = await postReceipt(cue, department, clientId)
      mergeServerCue(data.cue)
      if (status === 201) return { kind: 'created', receipt: data.receipt, cue: data.cue }
      return { kind: 'identical', receipt: data.receipt, cue: data.cue }
    } catch (error) {
      const response = (error as { response?: { status: number; data?: { outcome?: string; receipt?: Receipt; cue: Cue } } }).response
      if (response?.status === 409 && response.data) {
        mergeServerCue(response.data.cue)
        faultArmed.value = false
        if (response.data.outcome === 'stale-version') {
          return {
            kind: 'stale-version',
            submittedVersion: cue.version,
            cue: response.data.cue,
            department,
          }
        }
        return {
          kind: 'duplicate-slot',
          receipt: response.data.receipt as Receipt,
          cue: response.data.cue,
          department,
        }
      }
      faultArmed.value = false
      return { kind: 'network-error', message: '回执提交失败（网络或服务被模拟为失败），队列外操作未生效' }
    }
  }

  /* ------------------------------ 断网回执队列 ------------------------------ */

  /** 断网暂存：同一提示 + 同一部门重复补传只留一次（以最新版本覆盖） */
  function enqueueReceipt(cueId: string, department: Department) {
    const cue = findCue(cueId)
    if (!cue || !cue.issuedAt || locked.value) return
    const index = outbound.value.findIndex((item) => item.cueId === cueId && item.department === department)
    const existing = index >= 0 ? outbound.value[index] : null
    const item: OutboundReceipt = {
      localId: existing?.localId ?? randomId('que'),
      cueId,
      department,
      clientVersion: cue.version,
      clientId: existing?.clientId ?? randomId('cli'),
      queuedAt: nowText(),
      status: '待发送',
    }
    if (index >= 0) outbound.value.splice(index, 1, item)
    else outbound.value.push(item)
    flushMessage.value = ''
  }

  /**
   * 回网合并：先同步提示内容，再按队列顺序逐条上传回执。
   * - 200/201：合并并从队列移除
   * - 409：失效 / 重复回执已在服务端合并，移除该条
   * - 网络/5xx：保留原队列（失败条及之后全部不动），下次重试从未确认项继续
   */
  async function flushQueue(): Promise<{ ok: boolean; message: string; merged: number }> {
    if (isOffline.value) {
      return { ok: false, message: '当前处于离线模拟，恢复网络后将自动合并', merged: 0 }
    }
    if (flushing.value || outbound.value.length === 0) {
      return { ok: true, message: flushMessage.value || '队列中没有待发回执', merged: 0 }
    }
    flushing.value = true
    let merged = 0
    try {
      const contentOk = await syncCuesContent()
      if (!contentOk) {
        flushMessage.value = '同步失败：提示内容未送达，原回执队列已完整保留，稍后从未确认项重试'
        return { ok: false, message: flushMessage.value, merged }
      }

      while (outbound.value.length > 0) {
        const item = outbound.value[0]
        const cue = findCue(item.cueId)
        if (!cue) {
          outbound.value.shift()
          continue
        }
        try {
          const { data } = await axios.post<{ outcome: string; receipt: Receipt; cue: Cue }>(
            `/api/cues/${item.cueId}/receipts`,
            {
              version: item.clientVersion,
              department: item.department,
              operator: DEPARTMENT_OPERATOR[item.department],
              clientId: item.clientId,
            },
          )
          mergeServerCue(data.cue)
          outbound.value.shift()
          merged += 1
          // 200=幂等补传 / 201=首次生效，同一槽位都只保留一条
        } catch (error) {
          const err = error as { response?: { status: number; data?: { cue: Cue; outcome?: string } } }
          if (err.response?.status === 409 && err.response.data) {
            // 版本失效或槽位已被先到者占用：服务端已合并回执记录，本条确认完毕
            mergeServerCue(err.response.data.cue)
            outbound.value.shift()
            merged += 1
            faultArmed.value = false
            continue
          }
          item.status = '同步失败'
          flushMessage.value = `同步失败：${item.cueId} · ${item.department} 起队列原样保留，重试时将从未确认项继续`
          faultArmed.value = false
          return { ok: false, message: flushMessage.value, merged }
        }
      }
      flushMessage.value = merged ? `回网合并完成，${merged} 条回执已按提示 + 部门归并（重复补传仅保留一次）` : '队列已清空'
      return { ok: true, message: flushMessage.value, merged }
    } finally {
      flushing.value = false
    }
  }

  async function armFault() {
    try {
      await axios.post('/api/debug/fail-next', {})
      faultArmed.value = true
    } catch {
      faultArmed.value = false
    }
  }

  function toggleOffline() {
    isOffline.value = !isOffline.value
    if (!isOffline.value) {
      // 回网后自动合并
      void flushQueue()
    }
  }

  return {
    // state
    cues,
    selectedId,
    selectedCue,
    filteredCues,
    conflicts,
    fullyConfirmedCues,
    unissuedCues,
    waitingCues,
    missingSlotCount,
    baselineReady,
    baselineBlockers,
    baselineAt,
    zoom,
    actFilter,
    departmentFilter,
    revision,
    lastSaved,
    isOffline,
    locked,
    outbound,
    flushing,
    flushMessage,
    syncing,
    syncError,
    lastSyncAt,
    faultArmed,
    canUndo: computed(() => undoStack.value.length > 0),
    canRedo: computed(() => redoStack.value.length > 0),
    // actions
    beginEdit,
    endEdit,
    editDraft,
    publishDraft,
    issueCue,
    setReceiver,
    addWaypoint,
    addCue,
    undo,
    redo,
    addComment,
    toggleComment,
    lockBaseline,
    unlockBaseline,
    submitReceiptOnline,
    enqueueReceipt,
    flushQueue,
    armFault,
    toggleOffline,
    syncCuesContent,
  }
})
