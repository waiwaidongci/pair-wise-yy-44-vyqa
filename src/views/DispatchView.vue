<script setup lang="ts">
import { computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  useWorkshopStore,
  cueIssueState,
  effectiveReceipts,
  missingDepartments,
  voidedReceipts,
  isCueDirty,
  issueTagType,
  DEPARTMENTS,
  type Cue,
  type Department,
  type SubmitOutcome,
} from '../stores/workshop'

const store = useWorkshopStore()

const sortedCues = computed(() => [...store.cues].sort((a, b) => a.time.localeCompare(b.time)))
const confirmedCount = computed(() => store.fullyConfirmedCues.length)
const queueDepartments = (cue: Cue) =>
  store.outbound.filter((item) => item.cueId === cue.id).map((item) => item.department)

function receiptOf(cue: Cue, department: Department) {
  return effectiveReceipts(cue).find((item) => item.department === department) ?? null
}

function queuedOf(cue: Cue, department: Department) {
  return store.outbound.find((item) => item.cueId === cue.id && item.department === department) ?? null
}

async function issue(cue: Cue) {
  if (store.issueCue(cue.id)) ElMessage.success(`${cue.id} 已按 v${cue.version} 发放，等待 ${cue.receivers.join('、')} 回执`)
}

async function republish(cue: Cue) {
  try {
    await ElMessageBox.confirm(
      `发布后版本升到 v${cue.version + 1}：${cue.receivers.join('、')} 对旧版本的回执全部作废，提示回到待确认。`,
      `发布 ${cue.id} 新版本`,
      { confirmButtonText: '发布并作废旧回执', cancelButtonText: '继续编辑', type: 'warning' },
    )
  } catch {
    return
  }
  if (store.publishDraft(cue.id)) ElMessage.warning(`${cue.id} 已发布 v 新版，旧回执作废，等待部门重新确认`)
}

function describeOutcome(outcome: SubmitOutcome, cue: Cue, department: Department) {
  switch (outcome.kind) {
    case 'created':
      ElMessage.success(`${cue.id} · ${department} 回执生效（v${outcome.receipt.version}，序号 ${outcome.receipt.seq}）`)
      break
    case 'identical':
      ElMessage.info('该回执此前已提交，服务端按幂等只保留一次')
      break
    case 'duplicate-slot':
      ElMessage.warning(
        `槽位已被先到者占用：后到者看到已生效版本 v${outcome.receipt.version}（${outcome.receipt.operator} · ${outcome.receipt.submittedAt}）`,
      )
      break
    case 'stale-version':
      ElMessage.error(`提示已改版：你确认的 v${outcome.submittedVersion} 已作废，当前为 v${outcome.cue.version}，请重新确认当前版本`)
      break
    case 'locked':
      ElMessage.info('演出基线已锁定，不再接收回执')
      break
    case 'network-error':
      ElMessage.error(outcome.message)
      break
    default:
      ElMessage.warning(outcome.message)
  }
}

async function confirmReceipt(cue: Cue, department: Department) {
  if (store.isOffline) {
    store.enqueueReceipt(cue.id, department)
    ElMessage.success(`断网暂存：${cue.id} · ${department} 回执已入队，回网后按提示 + 部门合并`)
    return
  }
  const outcome = await store.submitReceiptOnline(cue.id, department)
  describeOutcome(outcome, cue, department)
}

/** 两岗同时点下同一提示同一部门的确认：服务端按到达顺序只放行一份 */
async function raceSubmit(cue: Cue) {
  if (store.isOffline) {
    ElMessage.info('离线状态下确认直接进入待发队列，请恢复网络后再演示并发')
    return
  }
  const target = missingDepartments(cue)[0]
  if (!target) {
    ElMessage.info('该提示当前版本已全部收齐，无法演示竞争')
    return
  }
  const [a, b] = await Promise.allSettled([
    store.submitReceiptOnline(cue.id, target),
    store.submitReceiptOnline(cue.id, target),
  ])
  const outcomes = [a, b].map((item) => (item.status === 'fulfilled' ? item.value : null))
  const winner = outcomes.find((item): item is Extract<SubmitOutcome, { kind: 'created' }> => item?.kind === 'created') ?? null
  const loser = outcomes.find((item): item is Extract<SubmitOutcome, { kind: 'duplicate-slot' }> => item?.kind === 'duplicate-slot') ?? null
  if (winner && loser) {
    ElMessageBox.alert(
      `先到者：${winner.receipt.operator}，序号 ${winner.receipt.seq}，回执生效。<br/>后到者：看到已生效版本 v${loser.receipt.version}（${loser.receipt.submittedAt}），未重复入账。`,
      `${cue.id} · ${target} 并发提交结果`,
      { dangerouslyUseHTMLString: true, confirmButtonText: '知道了' },
    )
  } else {
    outcomes.forEach((item) => item && describeOutcome(item, cue, target))
  }
}

async function lockBaseline() {
  const result = store.lockBaseline()
  if (result.ok) {
    ElMessage.success(`演出基线 ${store.revision} 已锁定，打印清单仅可输出版本收齐的提示`)
    return
  }
  const lines = result.blockers
    .map((item) => {
      const detail = item.state === '待确认' ? `缺 ${item.missing.join('、')} 回执` : '尚未发放'
      return `· ${item.cue.id} ${item.cue.title}：${detail}`
    })
    .join('<br/>')
  ElMessageBox.alert(`${lines}<br/><br/>未收齐当前版本回执的提示不能进入基线。`, '基线锁定被阻止', {
    dangerouslyUseHTMLString: true,
    type: 'warning',
  })
}

async function flush() {
  const result = await store.flushQueue()
  if (result.ok) ElMessage.success(result.message)
  else ElMessage.error(result.message)
}

async function armFault() {
  await store.armFault()
  ElMessage.warning('已安排下一次提交 / 同步失败：可立即“手动重试”，观察队列保留与断点续传')
}
</script>

<template>
  <section class="page dispatch-page">
    <div class="page-head">
      <div>
        <p class="eyebrow">DISPATCH / 发放流程</p>
        <h1>执行提示发放与部门回执</h1>
        <p class="muted">提示改版即作废旧回执并回到待确认；当前版本部门未收齐，不能锁定基线或打印清单。</p>
      </div>
      <div class="actions">
        <el-button :type="store.isOffline ? 'warning' : 'default'" @click="store.toggleOffline">
          {{ store.isOffline ? '模拟恢复网络（自动合并）' : '模拟断网' }}
        </el-button>
        <el-button type="primary" :disabled="store.locked || !store.baselineReady" @click="lockBaseline">
          锁定演出基线
        </el-button>
      </div>
    </div>

    <div class="summary-grid">
      <article class="panel summary">
        <span>发放状态</span>
        <strong>{{ confirmedCount }} / {{ store.cues.length }}</strong>
        <small>当前版本回执全部收齐</small>
      </article>
      <article class="panel summary">
        <span>待确认</span>
        <strong class="amber">{{ store.waitingCues.length }}</strong>
        <small>已发放，缺 {{ store.missingSlotCount }} 个部门回执</small>
      </article>
      <article class="panel summary">
        <span>未发放</span>
        <strong class="slate">{{ store.unissuedCues.length }}</strong>
        <small>旧数据无回执时按未发放显示</small>
      </article>
      <article class="panel summary" :class="{ ready: store.baselineReady }">
        <span>演出基线</span>
        <strong :class="store.locked ? 'green' : store.baselineReady ? 'green' : 'red'">
          {{ store.locked ? `已锁 ${store.revision}` : store.baselineReady ? '可锁定' : '不可锁定' }}
        </strong>
        <small>{{ store.baselineBlockers.length ? `${store.baselineBlockers.length} 条提示被拦在基线外` : `锁定于 ${store.baselineAt ?? '—'}` }}</small>
      </article>
    </div>

    <div class="flow-grid">
      <section class="cue-flow">
        <article v-for="cue in sortedCues" :key="cue.id" class="panel cue-card-big">
          <header class="cue-head">
            <div>
              <span class="cue-index">{{ cue.id }} · {{ cue.act }} / {{ cue.scene }} · {{ cue.time }}</span>
              <h3>{{ cue.title }}</h3>
              <small class="muted">执行部门 {{ cue.department }} · {{ cue.owner }} · 内容版本 v{{ cue.version }}</small>
            </div>
            <div class="cue-head-tags">
              <el-tag :type="issueTagType(cueIssueState(cue))" effect="dark">
                {{ cueIssueState(cue) }}
              </el-tag>
              <el-tag v-if="cue.issuedAt" type="info" effect="plain">发放于 {{ cue.issuedAt }}</el-tag>
            </div>
          </header>

          <el-alert
            v-if="!cue.issuedAt"
            type="info"
            show-icon
            :closable="false"
            title="该提示尚未发放，部门不会看到任何回执任务"
            description="发放后按当前内容固定版本，各部门对该版本进行确认。"
          >
            <el-button size="small" type="primary" style="margin-top: 8px" :disabled="store.locked" @click="issue(cue)">
              发放提示（v{{ cue.version }}）
            </el-button>
          </el-alert>

          <el-alert
            v-else-if="isCueDirty(cue)"
            type="warning"
            show-icon
            :closable="false"
            title="时间 / 路线 / 执行部门等内容已改动，但改动还未发布"
            description="现在发布才会作废旧版本回执；不发布则旧回执仍挂在旧版本上，且不能进入基线或打印。"
          >
            <el-button size="small" type="warning" style="margin-top: 8px" :disabled="store.locked" @click="republish(cue)">
              发布为 v{{ cue.version + 1 }}，旧回执作废并回到待确认
            </el-button>
          </el-alert>

          <div v-if="cue.issuedAt" class="receiver-block">
            <div class="receiver-title">
              <strong>应收回执部门</strong>
              <span>勾选调整发放范围（调整后立即作废旧回执）</span>
            </div>
            <div class="receiver-grid">
              <div v-for="department in DEPARTMENTS" :key="department" class="receiver-row">
                <el-checkbox
                  :model-value="cue.receivers.includes(department)"
                  :disabled="store.locked"
                  @change="(checked: boolean) => store.setReceiver(department, checked)"
                >
                  {{ department }}
                </el-checkbox>
                <template v-if="cue.receivers.includes(department)">
                  <div v-if="receiptOf(cue, department)" class="receipt-ok">
                    <el-tag type="success" size="small" effect="plain">
                      已确认 v{{ receiptOf(cue, department)!.version }}
                    </el-tag>
                    <small>{{ receiptOf(cue, department)!.operator }} · {{ receiptOf(cue, department)!.submittedAt }}</small>
                  </div>
                  <div v-else-if="queuedOf(cue, department)" class="receipt-queue">
                    <el-tag type="warning" size="small" effect="plain">断网待发 v{{ queuedOf(cue, department)!.clientVersion }}</el-tag>
                    <small>{{ queuedOf(cue, department)!.queuedAt }} 入队 · {{ queuedOf(cue, department)!.status }}</small>
                  </div>
                  <div v-else class="receipt-missing">
                    <el-tag type="danger" size="small" effect="plain">待确认 v{{ cue.version }}</el-tag>
                    <el-button size="small" type="primary" plain :disabled="store.locked" @click="confirmReceipt(cue, department)">
                      {{ store.isOffline ? '断网暂存回执' : '部门确认收到' }}
                    </el-button>
                  </div>
                </template>
                <span v-else class="muted receiver-skip">不发放</span>
              </div>
            </div>

            <details v-if="voidedReceipts(cue).length" class="voided-list">
              <summary>已作废回执（{{ voidedReceipts(cue).length }}）— 旧版本记录留痕，不进入基线与打印</summary>
              <ul>
                <li v-for="item in voidedReceipts(cue)" :key="item.id">
                  {{ item.department }} · v{{ item.version }} · {{ item.operator }} · {{ item.submittedAt }} · 已作废
                </li>
              </ul>
            </details>

            <div class="cue-actions">
              <el-button size="small" :disabled="store.locked || cueIssueState(cue) === '已确认' || store.isOffline" @click="raceSubmit(cue)">
                模拟双岗同时提交（先到者生效）
              </el-button>
              <el-button size="small" text type="primary" @click="$router.push('/stage')">在舞台图中编辑内容</el-button>
            </div>
          </div>
        </article>
      </section>

      <aside class="side-col">
        <section class="panel queue-panel">
          <div class="panel-head">
            <h3>断网回执队列</h3>
            <el-tag :type="store.isOffline ? 'warning' : 'success'" size="small" effect="plain">
              {{ store.isOffline ? '离线中' : '在线' }}
            </el-tag>
          </div>
          <div class="queue-body">
            <el-empty v-if="store.outbound.length === 0" description="队列是空的" :image-size="56" />
            <div v-else class="queue-list">
              <div v-for="item in store.outbound" :key="item.localId" class="queue-item" :class="{ failed: item.status === '同步失败' }">
                <strong>{{ item.cueId }} · {{ item.department }}</strong>
                <small>目标版本 v{{ item.clientVersion }} · {{ item.queuedAt }}</small>
                <el-tag size="small" :type="item.status === '同步失败' ? 'danger' : 'warning'">{{ item.status }}</el-tag>
              </div>
            </div>
            <p class="queue-note">
              回网后按「提示 + 部门」合并：同一槽位重复补传只留一次；同步失败保留原队列，重试从未确认项继续。
            </p>
            <div class="queue-actions">
              <el-button size="small" type="primary" :loading="store.flushing" :disabled="store.isOffline || !store.outbound.length" @click="flush">
                手动重试 / 回网合并
              </el-button>
              <el-button size="small" plain :disabled="store.flushing" @click="armFault">安排下次同步失败</el-button>
            </div>
            <p v-if="store.flushMessage" class="flush-message">{{ store.flushMessage }}</p>
          </div>
        </section>

        <section class="panel blocker-panel">
          <div class="panel-head"><h3>基线拦截清单</h3></div>
          <div class="blocker-body">
            <el-empty v-if="!store.baselineBlockers.length" description="全部提示当前版本收齐，可锁定基线" :image-size="56" />
            <ul v-else>
              <li v-for="item in store.baselineBlockers" :key="item.cue.id">
                <strong>{{ item.cue.id }} {{ item.cue.title }}</strong>
                <span v-if="item.state === '未发放'">未发放（{{ item.cue.receivers.join('、') }} 无回执）</span>
                <span v-else>缺 {{ item.missing.join('、') }} 的 v{{ item.cue.version }} 回执</span>
              </li>
            </ul>
            <el-button class="print-link" text type="primary" @click="$router.push('/print')">前往打印中心 →</el-button>
          </div>
        </section>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.dispatch-page {
  background: #eef2f4;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}

.summary {
  padding: 14px 16px;
}

.summary span {
  color: #697684;
  font-size: 12px;
}

.summary strong {
  display: block;
  margin: 5px 0 2px;
  font-size: 24px;
}

.summary small {
  color: #8a959d;
  font-size: 11px;
}

.amber {
  color: #b77014;
}

.slate {
  color: #5d6b78;
}

.green {
  color: #2f7d5b;
}

.red {
  color: #bd4b3f;
}

.flow-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 14px;
  align-items: start;
}

.cue-flow {
  display: grid;
  gap: 12px;
}

.cue-card-big {
  padding: 15px 16px;
}

.cue-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.cue-index {
  color: #6b7883;
  font-size: 11px;
}

.cue-head h3 {
  margin: 4px 0 3px;
  font-size: 16px;
}

.cue-head-tags {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

.receiver-block {
  margin-top: 12px;
}

.receiver-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 8px;
}

.receiver-title span {
  color: #93a0aa;
  font-size: 11px;
}

.receiver-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 18px;
}

.receiver-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid #e7ecee;
  border-radius: 7px;
  background: #fafbfc;
}

.receipt-ok,
.receipt-queue,
.receipt-missing {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.receipt-ok small,
.receipt-queue small {
  color: #7e8991;
  font-size: 11px;
}

.receiver-skip {
  font-size: 11px;
}

.voided-list {
  margin-top: 10px;
  font-size: 12px;
  color: #8a959d;
}

.voided-list summary {
  cursor: pointer;
}

.voided-list ul {
  margin: 6px 0 0;
  padding-left: 18px;
}

.cue-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}

.side-col {
  display: grid;
  gap: 12px;
  position: sticky;
  top: 12px;
}

.queue-body,
.blocker-body {
  padding: 12px 14px;
}

.queue-list {
  display: grid;
  gap: 8px;
}

.queue-item {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 3px 8px;
  padding: 9px 10px;
  border: 1px solid #e7ecee;
  border-radius: 7px;
  background: #fafbfc;
}

.queue-item.failed {
  border-color: #e2a29b;
  background: #fdf3f2;
}

.queue-item strong {
  font-size: 12px;
}

.queue-item small {
  grid-column: 1 / -1;
  color: #8a959d;
  font-size: 11px;
}

.queue-note {
  margin: 10px 0 0;
  color: #7e8991;
  font-size: 11px;
  line-height: 1.6;
}

.queue-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.flush-message {
  margin: 8px 0 0;
  padding: 7px 9px;
  border-radius: 6px;
  color: #9a5b1e;
  background: #fff5e3;
  font-size: 11px;
  line-height: 1.5;
}

.blocker-body ul {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.blocker-body li {
  padding: 8px 10px;
  border-left: 3px solid #d8912d;
  background: #fff8e8;
  border-radius: 4px;
}

.blocker-body li strong,
.blocker-body li span {
  display: block;
  font-size: 12px;
}

.blocker-body li span {
  margin-top: 2px;
  color: #8a6b34;
}

.print-link {
  margin-top: 10px;
}

@media (max-width: 1100px) {
  .flow-grid {
    grid-template-columns: 1fr;
  }

  .side-col {
    position: static;
  }
}

@media (max-width: 760px) {
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .receiver-grid {
    grid-template-columns: 1fr;
  }

  .cue-head {
    flex-direction: column;
  }

  .cue-head-tags {
    align-items: flex-start;
  }
}
</style>
