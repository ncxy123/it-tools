<script setup lang="ts">
import { Download, Plus, Trash, Upload } from '@vicons/tabler';
import {
  type CourseGrade,
  DEFAULT_OPTIONS,
  DEFAULT_SCALE_ID,
  type GradeParseError,
  INPUT_MODES,
  type InputMode,
  SCALE_RULES,
  bandsToText,
  computeGpa,
  createGradeId,
  getScaleRule,
  gradesToCsv,
  isValidScore,
  normalizeBands,
  parseBandsText,
  parseGradesFromText,
  projectTargetGpa,
} from './gpa.model';
import { usePersistentRef } from '@/composable/usePersistentRef';

const { t } = useI18n();
const message = useMessage();

const courses = usePersistentRef<CourseGrade[]>('campus-toolbox.gpa.courses', []);
const settings = usePersistentRef('campus-toolbox.gpa.settings', {
  scaleId: DEFAULT_SCALE_ID,
  mode: DEFAULT_OPTIONS.mode as InputMode,
  includeFailed: DEFAULT_OPTIONS.includeFailed,
  passLine: DEFAULT_OPTIONS.passLine ?? 60,
  customBandsText: bandsToText(SCALE_RULES.find(rule => rule.id === 'custom')!.bands),
  targetGpa: 3.5,
  remainingCredits: 20,
});

const importText = ref('');
const importErrors = ref<GradeParseError[]>([]);
const showImport = ref(false);
const showBands = ref(false);

const rule = computed(() =>
  getScaleRule(settings.value.scaleId, parseBandsText(settings.value.customBandsText)),
);

const result = computed(() =>
  computeGpa(courses.value, {
    rule: rule.value,
    mode: settings.value.mode,
    includeFailed: settings.value.includeFailed,
    passLine: settings.value.passLine,
  }),
);

const projection = computed(() =>
  projectTargetGpa(result.value, rule.value, Number(settings.value.targetGpa) || 0, Number(settings.value.remainingCredits) || 0),
);

const scaleOptions = computed(() => SCALE_RULES.map(item => ({ label: t(item.name), value: item.id })));

const bandRows = computed(() =>
  normalizeBands(rule.value.bands)
    .slice()
    .sort((a, b) => b.min - a.min)
    .map((band) => {
      const upper = normalizeBands(rule.value.bands)
        .filter(item => item.min > band.min)
        .map(item => item.min)
        .sort((a, b) => a - b)[0];
      return {
        range: upper === undefined ? `${band.min}–100` : `${band.min}–${Math.max(band.min, upper - 0.1)}`,
        point: band.point,
      };
    }),
);

const inputPlaceholder = computed(() => {
  const hint = INPUT_MODES.find(item => item.value === settings.value.mode)?.hint;
  return hint ? t(hint) : '';
});

function addRow() {
  courses.value.push({ id: createGradeId(), name: '', credits: null, raw: '', included: true });
}

function removeRow(id: string) {
  courses.value = courses.value.filter(item => item.id !== id);
}

function clearAll() {
  courses.value = [];
  importErrors.value = [];
  message.success(t('campus.common.cleared'));
}

const EXAMPLE_TEXT = `高等数学A 5 92
大学英语 3 85
大学物理 4 78
程序设计基础 4 95
线性代数 3 88
体育（篮球） 1 优秀
军事理论 2 良好
思想道德与法治 3 84`;

function loadExample() {
  const { courses: parsed, errors } = parseGradesFromText(EXAMPLE_TEXT, settings.value.mode);
  courses.value = parsed;
  importErrors.value = errors;
  message.success(t('campus.common.loadedExample', { n: parsed.length }));
}

function runImport(mode: 'append' | 'replace') {
  const { courses: parsed, errors } = parseGradesFromText(importText.value, settings.value.mode);
  importErrors.value = errors;

  if (!parsed.length) {
    message.warning(t('campus.gpa.importNothing'));
    return;
  }

  courses.value = mode === 'replace' ? parsed : [...courses.value, ...parsed];
  message.success(t('campus.gpa.imported', { n: parsed.length }));
  importText.value = '';
  showImport.value = false;
}

function exportCsv() {
  if (!courses.value.length) {
    message.warning(t('campus.gpa.exportEmpty'));
    return;
  }
  const blob = new Blob([gradesToCsv(result.value)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = '成绩绩点明细.csv';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  message.success(t('campus.gpa.exported'));
}

function applyCustomBands() {
  const bands = parseBandsText(settings.value.customBandsText);
  if (bands.length < 2) {
    message.warning(t('campus.gpa.customInvalid'));
    return;
  }
  settings.value.customBandsText = bandsToText(bands);
  message.success(t('campus.common.saved'));
}

function resetCustomBands() {
  settings.value.customBandsText = bandsToText(SCALE_RULES.find(item => item.id === 'custom')!.bands);
  message.success(t('campus.common.reset'));
}

onMounted(() => {
  if (!courses.value.length) {
    addRow();
  }
});
</script>

<template>
  <div style="flex: 0 0 100%">
    <c-card mb-3>
      <div class="settings-row">
        <c-select
          v-model:value="settings.scaleId"
          :options="scaleOptions"
          :label="t('campus.gpa.scaleLabel')"
          class="grow"
        />
        <c-select
          v-model:value="settings.mode"
          :options="INPUT_MODES.map(item => ({ label: t(item.label), value: item.value }))"
          :label="t('campus.gpa.modeLabel')"
          class="grow"
        />
        <div>
          <div class="mb-1 text-xs op-70">
            {{ t('campus.gpa.includeFailed') }}
          </div>
          <n-switch v-model:value="settings.includeFailed" />
        </div>
      </div>

      <div mt-2 text-xs op-60>
        {{ t(rule.note) }}
      </div>

      <n-collapse v-model:expanded-names="showBands" mt-2>
        <n-collapse-item name="bands" :title="t('campus.gpa.bandTableTitle')">
          <div class="band-table">
            <div v-for="row in bandRows" :key="row.range" class="band-cell">
              <span font-600>{{ row.range }}</span>
              <span op-70>→ {{ row.point }}</span>
            </div>
          </div>
        </n-collapse-item>
      </n-collapse>

      <template v-if="settings.scaleId === 'custom'">
        <c-input-text
          v-model:value="settings.customBandsText"
          class="mt-2"
          multiline
          :rows="6"
          monospace
          :label="t('campus.gpa.customBandsLabel')"
        />
        <div text-xs op-60>
          {{ t('campus.gpa.customBandsHint') }}
        </div>
        <div class="mt-2 flex gap-2">
          <c-button size="small" @click="applyCustomBands">
            {{ t('campus.common.apply') }}
          </c-button>
          <c-button size="small" @click="resetCustomBands">
            {{ t('campus.common.reset') }}
          </c-button>
        </div>
      </template>
    </c-card>

    <div class="stats-grid mb-3">
      <c-card>
        <div class="stat-label">
          {{ t('campus.gpa.metricGpa') }}
        </div>
        <div class="stat-value stat-primary">
          {{ result.gpa ?? '—' }}
        </div>
        <div class="stat-sub">
          {{ t('campus.gpa.metricGpaSub', { scale: t(rule.name) }) }}
        </div>
      </c-card>
      <c-card>
        <div class="stat-label">
          {{ t('campus.gpa.metricWeighted') }}
        </div>
        <div class="stat-value">
          {{ result.weightedAverage ?? '—' }}
        </div>
      </c-card>
      <c-card>
        <div class="stat-label">
          {{ t('campus.gpa.metricArithmetic') }}
        </div>
        <div class="stat-value">
          {{ result.arithmeticAverage ?? '—' }}
        </div>
      </c-card>
      <c-card>
        <div class="stat-label">
          {{ t('campus.gpa.metricCredits') }}
        </div>
        <div class="stat-value">
          {{ result.countedCredits }}
        </div>
        <div class="stat-sub">
          {{ t('campus.gpa.metricTotalCredits', { n: result.totalCredits }) }}
        </div>
      </c-card>
      <c-card>
        <div class="stat-label">
          {{ t('campus.gpa.metricFailed') }}
        </div>
        <div class="stat-value" :class="{ 'stat-danger': result.failedCount > 0 }">
          {{ result.failedCount }}
        </div>
        <div class="stat-sub">
          {{ t('campus.gpa.metricQualityPoints', { n: result.totalQualityPoints }) }}
        </div>
      </c-card>
    </div>

    <c-card mb-3>
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div font-600>
          {{ t('campus.gpa.courseListTitle') }}
        </div>
        <div class="flex flex-wrap gap-2">
          <c-button @click="addRow">
            <n-icon :component="Plus" mr-1 />{{ t('campus.gpa.addRow') }}
          </c-button>
          <c-button @click="showImport = true">
            <n-icon :component="Upload" mr-1 />{{ t('campus.gpa.bulkImport') }}
          </c-button>
          <c-button @click="loadExample">
            {{ t('campus.common.loadExample') }}
          </c-button>
          <c-button @click="exportCsv">
            <n-icon :component="Download" mr-1 />{{ t('campus.gpa.exportCsv') }}
          </c-button>
          <n-popconfirm @positive-click="clearAll">
            <template #trigger>
              <c-button type="error">
                <n-icon :component="Trash" mr-1 />{{ t('campus.common.clear') }}
              </c-button>
            </template>
            {{ t('campus.gpa.clearConfirm') }}
          </n-popconfirm>
        </div>
      </div>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th class="col-name">
                {{ t('campus.common.name') }}
              </th>
              <th class="col-credits">
                {{ t('campus.gpa.credits') }}
              </th>
              <th class="col-score">
                {{ t('campus.gpa.score') }}
              </th>
              <th class="col-point">
                {{ t('campus.gpa.point') }}
              </th>
              <th class="col-include">
                {{ t('campus.gpa.included') }}
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, index) in result.courses"
              :key="row.course.id"
              :class="{ 'row-error': row.error }"
            >
              <td>
                <n-input v-model:value="courses[index].name" :placeholder="t('campus.gpa.namePlaceholder')" />
              </td>
              <td>
                <n-input-number v-model:value="courses[index].credits" :min="0.5" :max="20" :step="0.5" w-100px />
              </td>
              <td>
                <n-input
                  v-model:value="courses[index].raw"
                  :placeholder="inputPlaceholder"
                  :status="courses[index].raw && !isValidScore(courses[index].raw, settings.mode) ? 'error' : undefined"
                  w-120px
                />
              </td>
              <td class="cell-point">
                <b>{{ row.point ?? '—' }}</b>
                <span v-if="row.qualityPoints !== null" text-xs op-60>
                  ({{ row.qualityPoints }})
                </span>
              </td>
              <td>
                <n-checkbox v-model:checked="courses[index].included" />
              </td>
              <td>
                <c-button size="small" type="error" variant="text" @click="removeRow(row.course.id)">
                  <n-icon :component="Trash" />
                </c-button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <n-alert v-if="result.errorCount" type="warning" :bordered="false" mt-3>
        {{ t('campus.gpa.rowErrors', { n: result.errorCount }) }}
      </n-alert>

      <div mt-3 text-xs op-60>
        {{ t('campus.gpa.tableHint') }}
      </div>
    </c-card>

    <c-card mb-3>
      <div mb-3 font-600>
        {{ t('campus.gpa.targetTitle') }}
      </div>

      <div class="settings-row">
        <n-input-number v-model:value="settings.targetGpa" :min="0" :max="5" :step="0.1" class="grow">
          <template #prefix>
            {{ t('campus.gpa.targetGpa') }}
          </template>
        </n-input-number>
        <n-input-number v-model:value="settings.remainingCredits" :min="0" :max="200" :step="1" class="grow">
          <template #prefix>
            {{ t('campus.gpa.remainingCredits') }}
          </template>
        </n-input-number>
      </div>

      <n-alert
        v-if="projection.achieved"
        type="success"
        :bordered="false"
        mt-3
      >
        {{ t('campus.gpa.targetAchieved') }}
      </n-alert>
      <n-alert
        v-else-if="projection.impossible"
        type="error"
        :bordered="false"
        mt-3
      >
        {{ t('campus.gpa.targetImpossible', { max: projection.maxPoint }) }}
      </n-alert>
      <n-alert
        v-else
        type="info"
        :bordered="false"
        mt-3
      >
        {{
          t('campus.gpa.targetRequired', {
            remaining: settings.remainingCredits,
            point: projection.requiredPoint,
            percent: projection.requiredPercent ?? '—',
          })
        }}
      </n-alert>

      <div mt-2 text-xs op-60>
        {{ t('campus.gpa.targetHint') }}
      </div>
    </c-card>

    <c-card mb-3>
      <div mb-2 font-600>
        {{ t('campus.gpa.whyTitle') }}
      </div>
      <ul class="why-list">
        <li>{{ t('campus.gpa.why1') }}</li>
        <li>{{ t('campus.gpa.why2') }}</li>
        <li>{{ t('campus.gpa.why3') }}</li>
        <li>{{ t('campus.gpa.why4') }}</li>
        <li>{{ t('campus.gpa.why5') }}</li>
      </ul>
    </c-card>

    <n-modal v-model:show="showImport" preset="card" style="max-width: 680px;" :title="t('campus.gpa.bulkImport')">
      <div mb-2 text-sm op-70>
        {{ t('campus.gpa.importFormat') }}
      </div>
      <div class="import-example">
        高等数学 5 92<br>
        大学英语,3,85<br>
        体育（篮球）&nbsp;&nbsp;1&nbsp;&nbsp;优秀
      </div>
      <c-input-text
        v-model:value="importText"
        multiline
        :rows="9"
        monospace
        :placeholder="t('campus.gpa.importPlaceholder')"
      />

      <div class="mt-3 flex flex-wrap gap-2">
        <c-button type="primary" @click="runImport('append')">
          {{ t('campus.gpa.importAppend') }}
        </c-button>
        <c-button type="warning" @click="runImport('replace')">
          {{ t('campus.gpa.importReplace') }}
        </c-button>
      </div>

      <div v-if="importErrors.length" mt-3>
        <n-alert type="error" :bordered="false" :title="t('campus.gpa.importErrors', { n: importErrors.length })">
          <div v-for="error in importErrors" :key="error.line" text-xs>
            {{ t('campus.gpa.importErrorLine', { line: error.line }) }}{{ error.text }} —— {{ error.reason }}
          </div>
        </n-alert>
      </div>
    </n-modal>
  </div>
</template>

<style lang="less" scoped>
.settings-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
}

.grow {
  flex: 1 1 200px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}

.stat-label {
  font-size: 12px;
  opacity: 0.65;
}

.stat-value {
  font-size: 26px;
  font-weight: 600;
  line-height: 1.3;
  word-break: break-all;
}

.stat-primary {
  color: #2080f0;
}

.stat-sub {
  font-size: 12px;
  opacity: 0.6;
}

.stat-danger {
  color: #d03050;
}

.band-table {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 6px;
}

.band-cell {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 4px;
  background: rgba(128, 128, 128, 0.1);
  font-size: 12px;
}

.table-wrap {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.data-table th {
  text-align: left;
  padding: 8px 8px;
  font-size: 12px;
  font-weight: 600;
  opacity: 0.7;
  border-bottom: 1px solid rgba(128, 128, 128, 0.25);
  white-space: nowrap;
}

.data-table td {
  padding: 6px 8px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.14);
  vertical-align: middle;
}

.col-name {
  min-width: 180px;
}

.col-credits {
  width: 110px;
}

.col-score {
  width: 130px;
}

.col-point {
  width: 110px;
}

.col-include {
  width: 60px;
}

.cell-point {
  white-space: nowrap;
}

.row-error td {
  background: rgba(208, 48, 80, 0.07);
}

.import-example {
  padding: 8px 10px;
  margin-bottom: 8px;
  border-radius: 4px;
  background: rgba(128, 128, 128, 0.1);
  font-family: monospace;
  font-size: 12px;
  line-height: 1.7;
}

.why-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.9;
  opacity: 0.85;
}
</style>
