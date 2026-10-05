<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useWorkshopStore, cueIssueState, missingDepartments } from '../stores/workshop'

const store = useWorkshopStore()
const includeNotes = ref(true)
const includeRoutes = ref(true)
const includeComments = ref(false)

/** 打印清单只纳入当前版本回执收齐的提示；未发放 / 待确认一律不输出 */
const printableCues = computed(() =>
  [...store.cues]
    .filter((cue) => cueIssueState(cue) === '已确认')
    .sort((a, b) => a.time.localeCompare(b.time)),
)
const blockedCues = computed(() =>
  [...store.cues]
    .filter((cue) => cueIssueState(cue) !== '已确认')
    .sort((a, b) => a.time.localeCompare(b.time)),
)
const canPrint = computed(() => printableCues.value.length > 0 && store.baselineReady)

function guardPrint(): boolean {
  if (!printableCues.value.length) {
    ElMessage.error('没有可打印的提示：未收齐当前版本回执的内容不能进入打印清单')
    return false
  }
  if (!store.baselineReady) {
    ElMessage.warning(`尚有 ${blockedCues.value.length} 条提示未收齐回执，打印已被拦截，请先到发放台催收`)
    return false
  }
  return true
}

function print() {
  if (!guardPrint()) return
  window.print()
}

function exportCsv() {
  if (!guardPrint()) return
  const rows = [
    ['编号', '时间码', '场景', '提示', '部门', '责任', '回执版本', '路线节点', '发放状态'],
    ...printableCues.value.map((cue) => [
      cue.id,
      cue.time,
      `${cue.act}/${cue.scene}`,
      cue.title,
      cue.department,
      cue.owner,
      `v${cue.version}（${cue.receivers.join('、')} 已确认）`,
      cue.route.map((point) => `${point.x},${point.y}`).join(' > '),
      '已确认',
    ]),
  ]
  const csv = `﻿${rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n')}`
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `潮汐来信-执行清单-${store.revision}.csv`
  link.click()
  URL.revokeObjectURL(url)
  ElMessage.success(`执行清单已导出（${printableCues.value.length} 条，均为当前版本收齐）`)
}
</script>

<template>
  <section class="page print-page">
    <div class="page-head no-print">
      <div>
        <p class="eyebrow">PRINT / 演出文档</p>
        <h1>走位表与执行清单</h1>
        <p class="muted">只有当前版本部门回执全部收齐、且基线就绪的提示才会进入打印清单；旧版本回执随内容改版作废。</p>
      </div>
      <div class="actions">
        <el-button @click="exportCsv" :disabled="!canPrint">导出 CSV</el-button>
        <el-button type="primary" :disabled="!canPrint" @click="print">打印 / 导出 PDF</el-button>
      </div>
    </div>

    <el-alert
      v-if="!canPrint"
      class="no-print print-alert"
      type="error"
      show-icon
      :closable="false"
      title="打印清单未放行"
    >
      <template #default>
        <div v-if="blockedCues.length" class="block-detail">
          <p v-for="cue in blockedCues" :key="cue.id">
            · {{ cue.id }} {{ cue.title }} —
            {{ cueIssueState(cue) === '未发放' ? '未发放' : `v${cue.version} 缺 ${missingDepartments(cue).join('、')} 回执` }}
          </p>
        </div>
        <el-button size="small" type="primary" plain style="margin-top: 8px" @click="$router.push('/dispatch')">去发放台收齐回执</el-button>
      </template>
    </el-alert>

    <div class="print-options panel no-print">
      <strong>文档内容</strong>
      <el-checkbox v-model="includeNotes">执行说明</el-checkbox>
      <el-checkbox v-model="includeRoutes">路线坐标</el-checkbox>
      <el-checkbox v-model="includeComments">未解决留言</el-checkbox>
      <span class="print-revision">
        基线 {{ store.locked ? store.revision : '未锁定' }} · 可打印 {{ printableCues.length }} / {{ store.cues.length }} · 生成于
        {{ new Date().toLocaleString('zh-CN') }}
      </span>
    </div>

    <article class="print-sheet">
      <header class="sheet-head">
        <div>
          <span>远岸剧团 · STAGE MANAGEMENT</span>
          <h2>《潮汐来信》执行清单</h2>
        </div>
        <dl>
          <div><dt>排练日</dt><dd>2026-10-08</dd></div>
          <div><dt>基线版本</dt><dd>{{ store.locked ? store.revision : '待锁定' }}</dd></div>
          <div><dt>场地</dt><dd>上海大剧院 · 大剧场</dd></div>
        </dl>
      </header>

      <table>
        <thead>
          <tr>
            <th>时间码</th>
            <th>幕 / 场</th>
            <th>执行提示</th>
            <th>部门 / 责任</th>
            <th>回执</th>
            <th>时长</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="cue in printableCues" :key="cue.id">
            <td class="mono">{{ cue.time }}</td>
            <td>{{ cue.act }} / {{ cue.scene }}</td>
            <td>
              <strong>{{ cue.id }} · {{ cue.title }}</strong>
              <p v-if="includeNotes">{{ cue.note }}</p>
              <small v-if="includeRoutes">路线：{{ cue.route.map((point, index) => `${index + 1}. ${point.x}/${point.y}`).join(' → ') }}</small>
              <em v-if="includeComments && cue.comments.length">{{ cue.comments.filter((item) => !item.resolved).length }} 条未解决留言</em>
            </td>
            <td>{{ cue.department }}<br /><small>{{ cue.owner }}</small></td>
            <td>
              <span v-for="department in cue.receivers" :key="department" class="sheet-receipt">
                {{ department }} ✓ v{{ cue.version }}
              </span>
            </td>
            <td>{{ cue.duration }} 秒</td>
            <td><b class="ok">已确认</b></td>
          </tr>
          <tr v-if="!printableCues.length">
            <td colspan="7" class="empty-sheet">当前没有可打印提示：全部提示均未收齐当前版本回执</td>
          </tr>
        </tbody>
      </table>

      <footer class="sheet-foot">
        <span>舞台监督：________________</span>
        <span>技术总监：________________</span>
        <span>制作人：________________</span>
      </footer>
    </article>
  </section>
</template>

<style scoped>
.print-page {
  background: #e8ecee;
}

.print-alert {
  margin-bottom: 12px;
}

.block-detail p {
  margin: 2px 0;
  font-size: 12px;
}

.print-options {
  display: flex;
  align-items: center;
  gap: 18px;
  margin-bottom: 14px;
  padding: 12px 15px;
}

.print-revision {
  margin-left: auto;
  color: #74818c;
  font-size: 12px;
}

.print-sheet {
  max-width: 1180px;
  min-height: 600px;
  margin: 0 auto;
  padding: 34px;
  background: #fff;
  box-shadow: 0 12px 34px rgb(35 54 65 / 12%);
}

.sheet-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding-bottom: 18px;
  border-bottom: 3px solid #173846;
}

.sheet-head span {
  color: #697985;
  font-size: 10px;
  letter-spacing: 0.15em;
}

.sheet-head h2 {
  margin: 8px 0 0;
  font-size: 25px;
}

.sheet-head dl {
  display: flex;
  gap: 22px;
  margin: 0;
}

.sheet-head dt {
  color: #818c95;
  font-size: 10px;
}

.sheet-head dd {
  margin: 4px 0 0;
  font-size: 12px;
  font-weight: 700;
}

table {
  width: 100%;
  margin-top: 20px;
  border-collapse: collapse;
  font-size: 12px;
}

th {
  padding: 10px 8px;
  color: #fff;
  text-align: left;
  background: #1c4251;
}

td {
  padding: 11px 8px;
  border-bottom: 1px solid #dfe5e8;
  vertical-align: top;
}

td strong,
td small,
td em {
  display: block;
}

td p {
  margin: 5px 0 0;
  color: #56636d;
  line-height: 1.5;
}

td small {
  margin-top: 6px;
  color: #7e8991;
}

td em {
  margin-top: 5px;
  color: #b05a2b;
  font-style: normal;
}

.sheet-receipt {
  display: block;
  margin-bottom: 3px;
  color: #2f7d5b;
  font-size: 11px;
}

.ok {
  color: #2f7d5b;
}

.empty-sheet {
  padding: 40px 8px;
  color: #8a959d;
  text-align: center;
}

.mono {
  color: #1d7371;
  font-family: ui-monospace, monospace;
  font-weight: 700;
}

.sheet-foot {
  display: flex;
  justify-content: space-between;
  margin-top: 48px;
  padding-top: 14px;
  border-top: 1px solid #dce2e5;
  color: #69757e;
  font-size: 11px;
}

@media print {
  @page {
    size: A4 landscape;
    margin: 12mm;
  }

  .no-print {
    display: none !important;
  }

  .print-page {
    padding: 0;
    background: #fff;
  }

  .print-sheet {
    max-width: none;
    padding: 0;
    box-shadow: none;
  }

  th {
    color: #111;
    background: #e8ecee;
  }
}

@media (max-width: 760px) {
  .print-options {
    align-items: flex-start;
    flex-direction: column;
  }

  .print-revision {
    margin-left: 0;
  }

  .print-sheet {
    overflow-x: auto;
    padding: 18px;
  }

  .sheet-head {
    flex-direction: column;
  }

  .sheet-head dl {
    flex-wrap: wrap;
  }
}
</style>
