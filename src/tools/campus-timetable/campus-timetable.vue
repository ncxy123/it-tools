<script setup lang="ts">
import {
  AlertTriangle,
  CalendarEvent,
  Check,
  Clock,
  Download,
  FileText,
  Plus,
  Share,
  Trash,
  Upload,
} from '@vicons/tabler';
import {
  type CourseSession,
  DEFAULT_META,
  type ParseError,
  type TimetableMeta,
  computeFreeSlots,
  computeStats,
  conflictedSessionIds,
  createSessionId,
  decodeShareCode,
  detectConflicts,
  encodeShareCode,
  expandWeeks,
  formatWeeks,
  generateCsv,
  generateIcs,
  parseCoursesFromText,
} from './timetable.model';
import { useCopy } from '@/composable/copy';
import { usePersistentRef } from '@/composable/usePersistentRef';

const { t } = useI18n();
const message = useMessage();
const { copy } = useCopy({ createToast: false });

const PALETTE = [
  '#18a058', '#2080f0', '#f0a020', '#8a70f0', '#00a6a6',
  '#e05f8a', '#2f9e44', '#4c6ef5', '#a9741f', '#0ea5e9',
];

const sessions = usePersistentRef<CourseSession[]>('campus-toolbox.timetable.sessions', []);
const meta = usePersistentRef<TimetableMeta>('campus-toolbox.timetable.meta', { ...DEFAULT_META });

const currentWeek = ref(1);
const showWeekend = ref(true);
const minSlotLength = ref(1);
const activePanel = ref<'grid' | 'conflicts' | 'free'>('grid');

const importText = ref('');
const importErrors = ref<ParseError[]>([]);
const importSummary = ref<{ count: number; weeks: string[] } | null>(null);
const showImport = ref(false);

const shareCode = ref('');
const shareInput = ref('');

const periodTimesText = ref(meta.value.periodTimes.map(p => `${p.start}-${p.end}`).join('\n'));
const semesterStartText = ref(meta.value.semesterStart);

const conflicts = computed(() => detectConflicts(sessions.value));
const conflictedIds = computed(() => conflictedSessionIds(conflicts.value));
const realConflicts = computed(() => conflicts.value.filter(c => !c.sameCourse));
const duplicateConflicts = computed(() => conflicts.value.filter(c => c.sameCourse));
const stats = computed(() => computeStats(sessions.value, meta.value, conflicts.value));

const daySet = computed(() => (showWeekend.value ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5]));

const weekOptions = computed(() =>
  Array.from({ length: Math.max(1, meta.value.totalWeeks) }, (_, index) => ({
    label: t('campus.timetable.weekLabel', { n: index + 1 }),
    value: index + 1,
  })),
);

const currentWeekSessions = computed(() =>
  sessions.value.filter(s => s.weeks.includes(currentWeek.value)),
);

const freeSlots = computed(() =>
  computeFreeSlots(sessions.value, currentWeek.value, {
    totalPeriods: meta.value.totalPeriods,
    minLength: minSlotLength.value,
    days: daySet.value,
  }),
);

const weekdayLabels = computed(() => [
  t('campus.weekday.mon'),
  t('campus.weekday.tue'),
  t('campus.weekday.wed'),
  t('campus.weekday.thu'),
  t('campus.weekday.fri'),
  t('campus.weekday.sat'),
  t('campus.weekday.sun'),
]);

const freeSlotLines = computed(() =>
  daySet.value.map(day => ({
    day,
    label: weekdayLabels.value[day - 1],
    slots: freeSlots.value
      .filter(slot => slot.day === day)
      .map(slot => t('campus.timetable.periodRange', { a: slot.startPeriod, b: slot.endPeriod })),
  })),
);

const colorMap = computed(() => {
  const map = new Map<string, string>();
  [...new Set(sessions.value.map(s => s.name.trim()))]
    .sort((a, b) => a.localeCompare(b, 'zh-Hans'))
    .forEach((name, index) => map.set(name, PALETTE[index % PALETTE.length]));
  return map;
});

const sortedSessions = computed(() =>
  [...sessions.value].sort((a, b) => a.day - b.day || a.startPeriod - b.startPeriod || a.name.localeCompare(b.name, 'zh-Hans')),
);

const gridDays = computed(() =>
  daySet.value.map((day) => {
    const todays = currentWeekSessions.value
      .filter(s => s.day === day)
      .sort((a, b) => a.startPeriod - b.startPeriod || b.endPeriod - a.endPeriod);

    const lanes: [number, number][][] = [];
    const blocks = todays.map((session) => {
      let lane = lanes.findIndex(ranges => ranges.every(([start, end]) => session.startPeriod > end || session.endPeriod < start));
      if (lane === -1) {
        lane = lanes.length;
        lanes.push([]);
      }
      lanes[lane].push([session.startPeriod, session.endPeriod]);
      return { session, lane };
    });

    return { day, blocks, laneCount: Math.max(1, lanes.length) };
  }),
);

const periodRows = computed(() =>
  Array.from({ length: meta.value.totalPeriods }, (_, index) => ({
    period: index + 1,
    time: meta.value.periodTimes[index] ? `${meta.value.periodTimes[index].start}` : '',
  })),
);

const weekHint = computed(() => {
  const teaching = new Set(sessions.value.flatMap(s => s.weeks));
  if (!teaching.size) {
    return '';
  }
  const sorted = [...teaching].sort((a, b) => a - b);
  return t('campus.timetable.weekHint', { list: formatWeeks(sorted) });
});

const form = reactive({
  id: '',
  name: '',
  day: 1,
  startPeriod: 1,
  endPeriod: 2,
  weeksText: '1-16',
  location: '',
  teacher: '',
});

const formWeeks = computed(() => expandWeeks(form.weeksText));
const isEditing = computed(() => Boolean(form.id));

function resetForm() {
  Object.assign(form, {
    id: '',
    name: '',
    day: 1,
    startPeriod: 1,
    endPeriod: 2,
    weeksText: '1-16',
    location: '',
    teacher: '',
  });
}

function submitForm() {
  if (!form.name.trim()) {
    message.warning(t('campus.timetable.needName'));
    return;
  }
  if (!formWeeks.value.length) {
    message.warning(t('campus.timetable.needWeeks'));
    return;
  }
  if (form.endPeriod < form.startPeriod) {
    message.warning(t('campus.timetable.needPeriodOrder'));
    return;
  }

  const payload: CourseSession = {
    id: form.id || createSessionId(),
    name: form.name.trim(),
    day: form.day,
    startPeriod: form.startPeriod,
    endPeriod: form.endPeriod,
    weeks: formWeeks.value,
    location: form.location.trim() || undefined,
    teacher: form.teacher.trim() || undefined,
  };

  if (form.id) {
    const index = sessions.value.findIndex(s => s.id === form.id);
    if (index >= 0) {
      sessions.value[index] = payload;
    }
  }
  else {
    sessions.value.push(payload);
  }

  message.success(t(isEditing.value ? 'campus.common.saved' : 'campus.common.added'));
  resetForm();
}

function editSession(session: CourseSession) {
  Object.assign(form, {
    id: session.id,
    name: session.name,
    day: session.day,
    startPeriod: session.startPeriod,
    endPeriod: session.endPeriod,
    weeksText: session.weeks.join(','),
    location: session.location ?? '',
    teacher: session.teacher ?? '',
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function removeSession(id: string) {
  sessions.value = sessions.value.filter(s => s.id !== id);
  if (form.id === id) {
    resetForm();
  }
}

function clearAll() {
  sessions.value = [];
  importSummary.value = null;
  importErrors.value = [];
  resetForm();
  message.success(t('campus.common.cleared'));
}

function runParse() {
  const { sessions: parsed, errors } = parseCoursesFromText(importText.value);
  importErrors.value = errors;
  importSummary.value = {
    count: parsed.length,
    weeks: [...new Set(parsed.flatMap(s => s.weeks))].sort((a, b) => a - b).map(String),
  };
  return parsed;
}

function importParsed(mode: 'append' | 'replace') {
  const parsed = runParse();
  if (!parsed.length) {
    message.warning(t('campus.timetable.importNothing'));
    return;
  }
  sessions.value = mode === 'replace' ? parsed : [...sessions.value, ...parsed];
  message.success(t('campus.timetable.imported', { n: parsed.length }));
  importText.value = '';
  importSummary.value = null;
  importErrors.value = [];
  showImport.value = false;
}

const EXAMPLE_TEXT = `高等数学A | 周一 | 1-2 | 1-16 | 教1-201 | 张伟
高等数学A | 周三 | 3-4 | 1-16 | 教1-201 | 张伟
大学英语 | 周二 | 3-4 | 1-16周(单) | 外语楼302 | 李娜
大学物理 | 周二 | 5-6 | 1-16 | 理科楼B101 | 王强
大学物理 | 周四 | 1-2 | 1-16 | 理科楼B101 | 王强
程序设计基础 | 周三 | 5-6 | 1-16 | 机房A305 | 陈明
程序设计基础 | 周五 | 3-4 | 1-16 | 机房A305 | 陈明
体育（篮球） | 周四 | 5-6 | 1-16 | 东区操场 | 赵磊
思想道德与法治 | 周五 | 9-10 | 1-8 | 文科楼101
军事理论 | 周三 | 9-10 | 9-16 | 礼堂`;

function loadExample() {
  const { sessions: parsed } = parseCoursesFromText(EXAMPLE_TEXT);
  sessions.value = parsed;
  importErrors.value = [];
  importSummary.value = null;
  resetForm();
  message.success(t('campus.timetable.exampleLoaded', { n: parsed.length }));
}

function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportIcs() {
  if (!sessions.value.length) {
    message.warning(t('campus.timetable.exportEmpty'));
    return;
  }
  downloadTextFile('我的课表.ics', generateIcs({ sessions: sessions.value, meta: meta.value }), 'text/calendar');
  message.success(t('campus.timetable.exportedIcs'));
}

function exportCsv() {
  if (!sessions.value.length) {
    message.warning(t('campus.timetable.exportEmpty'));
    return;
  }
  downloadTextFile('我的课表.csv', generateCsv(sortedSessions.value), 'text/csv');
  message.success(t('campus.timetable.exportedCsv'));
}

async function makeShareCode() {
  if (!sessions.value.length) {
    message.warning(t('campus.timetable.exportEmpty'));
    return;
  }
  shareCode.value = encodeShareCode(meta.value, sessions.value);
  await copy(shareCode.value);
  message.success(t('campus.common.copied'));
}

function importShareCode() {
  const decoded = decodeShareCode(shareInput.value);
  if (!decoded) {
    message.error(t('campus.timetable.shareInvalid'));
    return;
  }
  meta.value = { ...meta.value, ...decoded.meta };
  periodTimesText.value = meta.value.periodTimes.map(p => `${p.start}-${p.end}`).join('\n');
  semesterStartText.value = meta.value.semesterStart;
  sessions.value = decoded.sessions;
  shareInput.value = '';
  message.success(t('campus.timetable.shareImported', { n: decoded.sessions.length }));
}

function applyPeriodTimes() {
  const parsed = periodTimesText.value
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [start, end] = line.split(/[-~—\s]+/);
      return { start: start ?? '', end: end ?? '' };
    })
    .filter(item => /^\d{1,2}:\d{2}$/.test(item.start));

  if (!parsed.length) {
    message.warning(t('campus.timetable.periodTimesInvalid'));
    periodTimesText.value = meta.value.periodTimes.map(p => `${p.start}-${p.end}`).join('\n');
    return;
  }
  meta.value = { ...meta.value, periodTimes: parsed };
  message.success(t('campus.timetable.periodTimesSaved', { n: parsed.length }));
}

function applySemesterStart() {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(semesterStartText.value)) {
    message.warning(t('campus.timetable.dateInvalid'));
    semesterStartText.value = meta.value.semesterStart;
    return;
  }
  meta.value = { ...meta.value, semesterStart: semesterStartText.value };
  message.success(t('campus.common.saved'));
}

function jumpToConflictWeek(weeks: number[]) {
  currentWeek.value = weeks[0] ?? 1;
  activePanel.value = 'grid';
}

function formatPeriodRange(start: number, end: number): string {
  return start === end ? `${start}` : `${start}-${end}`;
}

watchEffect(() => {
  if (!sessions.value.length) {
    return;
  }
  const teaching = new Set(sessions.value.flatMap(s => s.weeks));
  if (!teaching.has(currentWeek.value) && teaching.size) {
    currentWeek.value = Math.min(...teaching);
  }
});

watch(() => meta.value.totalWeeks, (value) => {
  if (currentWeek.value > value) {
    currentWeek.value = Math.max(1, value);
  }
});
</script>

<template>
  <div style="flex: 0 0 100%">
    <c-card mb-3>
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-2">
          <n-icon :component="CalendarEvent" :size="22" />
          <n-select v-model:value="currentWeek" :options="weekOptions" w-140px />
        </div>

        <c-buttons-select
          v-model:value="activePanel"
          :options="[
            { label: t('campus.timetable.tabGrid'), value: 'grid' },
            { label: t('campus.timetable.tabConflicts'), value: 'conflicts' },
            { label: t('campus.timetable.tabFree'), value: 'free' },
          ]"
        />

        <div class="flex-1" />

        <c-button @click="showImport = true">
          <n-icon :component="Upload" mr-1 />{{ t('campus.timetable.bulkImport') }}
        </c-button>
        <c-button @click="loadExample">
          {{ t('campus.common.loadExample') }}
        </c-button>
      </div>

      <div v-if="weekHint" mt-2 text-xs op-60>
        {{ weekHint }}
      </div>
    </c-card>

    <div class="stats-grid mb-3">
      <c-card>
        <div class="stat-label">
          {{ t('campus.timetable.statCourses') }}
        </div>
        <div class="stat-value">
          {{ stats.courseCount }}
        </div>
      </c-card>
      <c-card>
        <div class="stat-label">
          {{ t('campus.timetable.statSessions') }}
        </div>
        <div class="stat-value">
          {{ stats.sessionCount }}
        </div>
      </c-card>
      <c-card>
        <div class="stat-label">
          {{ t('campus.timetable.statBusiest') }}
        </div>
        <div class="stat-value" :class="{ 'stat-danger': stats.busiestWeekPeriods >= 30 }">
          {{ stats.busiestWeekPeriods }}
        </div>
        <div class="stat-sub">
          {{ t('campus.timetable.weekLabel', { n: stats.busiestWeek }) }}
        </div>
      </c-card>
      <c-card>
        <div class="stat-label">
          {{ t('campus.timetable.statConflicts') }}
        </div>
        <div class="stat-value" :class="{ 'stat-danger': realConflicts.length > 0 }">
          {{ realConflicts.length }}
        </div>
        <div class="stat-sub">
          {{ t('campus.timetable.statFreeNow', { n: freeSlots.length }) }}
        </div>
      </c-card>
    </div>

    <c-card v-if="!sessions.length" mb-3>
      <div class="empty-state">
        <n-icon :component="CalendarEvent" :size="40" />
        <div font-600>
          {{ t('campus.timetable.emptyTitle') }}
        </div>
        <div text-sm op-70>
          {{ t('campus.timetable.emptyHint') }}
        </div>
        <div class="flex flex-wrap justify-center gap-2">
          <c-button type="primary" @click="showImport = true">
            <n-icon :component="Upload" mr-1 />{{ t('campus.timetable.bulkImport') }}
          </c-button>
          <c-button @click="loadExample">
            {{ t('campus.common.loadExample') }}
          </c-button>
        </div>
      </div>
    </c-card>

    <c-card v-if="activePanel === 'grid' && sessions.length" mb-3>
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div font-600>
          {{ t('campus.timetable.gridTitle') }}
        </div>
        <div class="flex items-center gap-3">
          <n-checkbox v-model:checked="showWeekend">
            {{ t('campus.timetable.showWeekend') }}
          </n-checkbox>
          <span text-xs op-60>{{ t('campus.timetable.gridLegend') }}</span>
        </div>
      </div>

      <div class="grid-scroll">
        <div class="tt-grid" :style="{ gridTemplateColumns: `64px repeat(${daySet.length}, minmax(96px, 1fr))` }">
          <div class="tt-corner">
            {{ t('campus.timetable.periodColumn') }}
          </div>
          <div v-for="day in daySet" :key="`h-${day}`" class="tt-head">
            {{ weekdayLabels[day - 1] }}
          </div>

          <template v-for="row in periodRows" :key="`r-${row.period}`">
            <div class="tt-time" :style="{ gridRow: row.period + 1, gridColumn: 1 }">
              <div font-600>
                {{ row.period }}
              </div>
              <div text-11px op-55>
                {{ row.time }}
              </div>
            </div>
            <div
              v-for="(day, dayIndex) in daySet"
              :key="`c-${day}-${row.period}`"
              class="tt-cell"
              :style="{ gridRow: row.period + 1, gridColumn: dayIndex + 2 }"
            />
          </template>

          <template v-for="column in gridDays" :key="`col-${column.day}`">
            <div
              v-for="block in column.blocks"
              :key="block.session.id"
              class="tt-block"
              :class="{ 'tt-block-conflict': conflictedIds.has(block.session.id) }"
              :style="{
                gridColumn: daySet.indexOf(column.day) + 2,
                gridRow: `${block.session.startPeriod + 1} / span ${block.session.endPeriod - block.session.startPeriod + 1}`,
                marginLeft: `calc(${(block.lane / column.laneCount) * 100}% + 2px)`,
                marginRight: `calc(${((column.laneCount - 1 - block.lane) / column.laneCount) * 100}% + 2px)`,
                background: `${colorMap.get(block.session.name) ?? '#888'}22`,
                borderLeftColor: colorMap.get(block.session.name) ?? '#888',
              }"
              :title="`${block.session.name}${block.session.location ? ` @ ${block.session.location}` : ''}`"
              @click="editSession(block.session)"
            >
              <div class="tt-block-name">
                {{ block.session.name }}
              </div>
              <div v-if="block.session.location" class="tt-block-meta">
                {{ block.session.location }}
              </div>
              <div v-if="block.session.teacher" class="tt-block-meta">
                {{ block.session.teacher }}
              </div>
            </div>
          </template>
        </div>
      </div>
    </c-card>

    <c-card v-if="activePanel === 'conflicts'" mb-3>
      <div mb-3 font-600>
        {{ t('campus.timetable.conflictTitle') }}
      </div>

      <n-alert v-if="!realConflicts.length" type="success" :bordered="false">
        {{ t('campus.timetable.noConflict') }}
      </n-alert>

      <div v-else class="flex flex-col gap-2">
        <n-alert v-for="(conflict, index) in realConflicts" :key="index" type="error" :bordered="false">
          <div class="flex flex-wrap items-center gap-2">
            <n-icon :component="AlertTriangle" />
            <b>{{ weekdayLabels[conflict.day - 1] }} {{ formatPeriodRange(conflict.startPeriod, conflict.endPeriod) }}{{ t('campus.timetable.periodSuffix') }}</b>
            <span>·</span>
            <span>{{ formatWeeks(conflict.weeks) }}</span>
          </div>
          <div mt-1 text-sm>
            {{ conflict.a.name }}
            <span op-60>({{ conflict.a.location || '—' }})</span>
            <span mx-1>×</span>
            {{ conflict.b.name }}
            <span op-60>({{ conflict.b.location || '—' }})</span>
          </div>
          <div mt-2>
            <c-button size="small" @click="jumpToConflictWeek(conflict.weeks)">
              {{ t('campus.timetable.jumpToWeek') }}
            </c-button>
          </div>
        </n-alert>
      </div>

      <template v-if="duplicateConflicts.length">
        <div mb-2 mt-4 text-sm font-600 op-75>
          {{ t('campus.timetable.duplicateTitle') }}
        </div>
        <div v-for="(conflict, index) in duplicateConflicts" :key="`d-${index}`" text-sm op-70>
          {{ conflict.a.name }} —— {{ weekdayLabels[conflict.day - 1] }}
          {{ formatPeriodRange(conflict.startPeriod, conflict.endPeriod) }}{{ t('campus.timetable.periodSuffix') }}
          · {{ formatWeeks(conflict.weeks) }}
        </div>
      </template>
    </c-card>

    <c-card v-if="activePanel === 'free'" mb-3>
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div font-600>
          {{ t('campus.timetable.freeTitle') }}
        </div>
        <div class="flex items-center gap-2">
          <span text-sm op-70>{{ t('campus.timetable.freeMinLength') }}</span>
          <n-input-number v-model:value="minSlotLength" :min="1" :max="8" w-100px />
        </div>
      </div>

      <div class="flex flex-col gap-1">
        <div v-for="line in freeSlotLines" :key="line.day" class="free-line">
          <b>{{ line.label }}</b>
          <template v-if="line.slots.length">
            <span v-for="slot in line.slots" :key="slot" class="free-chip">{{ slot }}</span>
          </template>
          <span v-else op-60>{{ t('campus.timetable.freeNone') }}</span>
        </div>
      </div>

      <div mt-3 text-xs op-60>
        {{ t('campus.timetable.freeHint', { week: currentWeek }) }}
      </div>
    </c-card>

    <c-card v-if="sessions.length" mb-3>
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div font-600>
          {{ t('campus.timetable.listTitle', { n: sessions.length }) }}
        </div>
        <div class="flex flex-wrap gap-2">
          <c-button @click="exportIcs">
            <n-icon :component="Download" mr-1 />{{ t('campus.timetable.exportIcs') }}
          </c-button>
          <c-button @click="exportCsv">
            <n-icon :component="FileText" mr-1 />{{ t('campus.timetable.exportCsv') }}
          </c-button>
          <c-button @click="makeShareCode">
            <n-icon :component="Share" mr-1 />{{ t('campus.timetable.shareCode') }}
          </c-button>
          <n-popconfirm @positive-click="clearAll">
            <template #trigger>
              <c-button type="error">
                <n-icon :component="Trash" mr-1 />{{ t('campus.common.clear') }}
              </c-button>
            </template>
            {{ t('campus.timetable.clearConfirm') }}
          </n-popconfirm>
        </div>
      </div>

      <div v-if="shareCode" mb-3>
        <c-input-text
          :value="shareCode"
          readonly
          multiline
          :rows="3"
          :label="t('campus.timetable.shareLabel')"
        />
        <div text-xs op-60>
          {{ t('campus.timetable.shareHint') }}
        </div>
      </div>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>{{ t('campus.common.name') }}</th>
              <th>{{ t('campus.timetable.day') }}</th>
              <th>{{ t('campus.timetable.period') }}</th>
              <th>{{ t('campus.timetable.weeks') }}</th>
              <th>{{ t('campus.common.location') }}</th>
              <th>{{ t('campus.common.teacher') }}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr v-for="session in sortedSessions" :key="session.id" :class="{ 'row-conflict': conflictedIds.has(session.id) }">
              <td>
                <span class="color-dot" :style="{ background: colorMap.get(session.name) ?? '#888' }" />
                {{ session.name }}
              </td>
              <td>{{ weekdayLabels[session.day - 1] }}</td>
              <td>{{ session.startPeriod }}-{{ session.endPeriod }}</td>
              <td>{{ formatWeeks(session.weeks) }}</td>
              <td>{{ session.location || '—' }}</td>
              <td>{{ session.teacher || '—' }}</td>
              <td class="table-actions">
                <c-button size="small" @click="editSession(session)">
                  {{ t('campus.common.edit') }}
                </c-button>
                <c-button size="small" type="error" variant="text" @click="removeSession(session.id)">
                  {{ t('campus.common.delete') }}
                </c-button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </c-card>

    <c-card mb-3>
      <div mb-3 font-600>
        {{ isEditing ? t('campus.timetable.editTitle') : t('campus.timetable.addTitle') }}
      </div>

      <div class="form-grid">
        <c-input-text
          v-model:value="form.name"
          :label="t('campus.common.name')"
          :placeholder="t('campus.timetable.namePlaceholder')"
        />
        <c-select
          v-model:value="form.day"
          :label="t('campus.timetable.day')"
          :options="weekdayLabels.map((label, index) => ({ label, value: index + 1 }))"
        />
        <div class="flex items-end gap-2">
          <n-input-number v-model:value="form.startPeriod" :min="1" :max="meta.totalPeriods" :label="t('campus.timetable.startPeriod')">
            <template #prefix>
              {{ t('campus.timetable.startPeriod') }}
            </template>
          </n-input-number>
          <n-input-number v-model:value="form.endPeriod" :min="1" :max="meta.totalPeriods">
            <template #prefix>
              {{ t('campus.timetable.endPeriod') }}
            </template>
          </n-input-number>
        </div>
        <div>
          <c-input-text
            v-model:value="form.weeksText"
            :label="t('campus.timetable.weeks')"
            placeholder="1-16 / 1-16单 / 1,3,5"
          />
          <div v-if="formWeeks.length" text-xs op-60>
            {{ t('campus.timetable.weeksPreview', { text: formatWeeks(formWeeks), n: formWeeks.length }) }}
          </div>
          <div v-else text-xs op-60>
            {{ t('campus.timetable.weeksHelp') }}
          </div>
        </div>
        <c-input-text v-model:value="form.location" :label="t('campus.common.location')" :placeholder="t('campus.timetable.locationPlaceholder')" />
        <c-input-text v-model:value="form.teacher" :label="t('campus.common.teacher')" :placeholder="t('campus.timetable.teacherPlaceholder')" />
      </div>

      <div class="mt-3 flex gap-2">
        <c-button type="primary" @click="submitForm">
          <n-icon :component="isEditing ? Check : Plus" mr-1 />
          {{ isEditing ? t('campus.common.save') : t('campus.common.add') }}
        </c-button>
        <c-button v-if="isEditing" @click="resetForm">
          {{ t('campus.common.cancel') }}
        </c-button>
      </div>
    </c-card>

    <c-card mb-3>
      <div mb-2 font-600>
        {{ t('campus.timetable.shareImportTitle') }}
      </div>
      <c-input-text
        v-model:value="shareInput"
        multiline
        :rows="2"
        :placeholder="t('campus.timetable.sharePlaceholder')"
      />
      <c-button mt-2 @click="importShareCode">
        {{ t('campus.timetable.shareImportButton') }}
      </c-button>
    </c-card>

    <c-card mb-3>
      <div mb-3 font-600>
        {{ t('campus.common.settings') }}
      </div>

      <div class="form-grid">
        <div>
          <c-input-text v-model:value="semesterStartText" :label="t('campus.timetable.semesterStart')" placeholder="2026-09-07" />
          <div text-xs op-60>
            {{ t('campus.timetable.semesterStartHint') }}
          </div>
          <c-button size="small" mt-2 @click="applySemesterStart">
            {{ t('campus.common.apply') }}
          </c-button>
        </div>

        <div>
          <div class="flex gap-2">
            <n-input-number v-model:value="meta.totalWeeks" :min="1" :max="30" :label="t('campus.timetable.totalWeeks')">
              <template #prefix>
                {{ t('campus.timetable.totalWeeks') }}
              </template>
            </n-input-number>
            <n-input-number v-model:value="meta.totalPeriods" :min="4" :max="16" :label="t('campus.timetable.totalPeriods')">
              <template #prefix>
                {{ t('campus.timetable.totalPeriods') }}
              </template>
            </n-input-number>
          </div>
        </div>
      </div>

      <div mt-3>
        <c-input-text
          v-model:value="periodTimesText"
          :label="t('campus.timetable.periodTimes')"
          multiline
          :rows="8"
          monospace
        />
        <div text-xs op-60>
          {{ t('campus.timetable.periodTimesHint') }}
        </div>
        <c-button size="small" mt-2 @click="applyPeriodTimes">
          <n-icon :component="Clock" mr-1 />{{ t('campus.common.apply') }}
        </c-button>
      </div>
    </c-card>

    <c-card mb-3>
      <div mb-2 font-600>
        {{ t('campus.timetable.whyTitle') }}
      </div>
      <ul class="why-list">
        <li>{{ t('campus.timetable.why1') }}</li>
        <li>{{ t('campus.timetable.why2') }}</li>
        <li>{{ t('campus.timetable.why3') }}</li>
        <li>{{ t('campus.timetable.why4') }}</li>
        <li>{{ t('campus.timetable.why5') }}</li>
      </ul>
    </c-card>

    <n-modal v-model:show="showImport" preset="card" style="max-width: 720px;" :title="t('campus.timetable.bulkImport')">
      <div mb-2 text-sm op-70>
        {{ t('campus.timetable.importFormat') }}
      </div>
      <div class="import-example">
        高等数学 | 周一 | 1-2 | 1-16 | 教1-201 | 张伟<br>
        大学英语, 周二, 3-4, 1-16周(单), 外语楼302<br>
        军事理论&nbsp;&nbsp;周五&nbsp;&nbsp;9-10&nbsp;&nbsp;1-8&nbsp;&nbsp;礼堂
      </div>
      <c-input-text
        v-model:value="importText"
        multiline
        :rows="10"
        monospace
        :placeholder="t('campus.timetable.importPlaceholder')"
      />

      <div class="mt-3 flex flex-wrap items-center gap-2">
        <c-button @click="runParse()">
          {{ t('campus.timetable.importPreview') }}
        </c-button>
        <c-button type="primary" @click="importParsed('append')">
          {{ t('campus.timetable.importAppend') }}
        </c-button>
        <c-button type="warning" @click="importParsed('replace')">
          {{ t('campus.timetable.importReplace') }}
        </c-button>
      </div>

      <div v-if="importSummary" mt-3>
        <n-alert :type="importSummary.count ? 'success' : 'warning'" :bordered="false">
          {{ t('campus.timetable.importResult', { n: importSummary.count }) }}
        </n-alert>
      </div>

      <div v-if="importErrors.length" mt-2>
        <n-alert type="error" :bordered="false" :title="t('campus.timetable.importErrors', { n: importErrors.length })">
          <div v-for="error in importErrors" :key="error.line" text-xs>
            {{ t('campus.timetable.importErrorLine', { line: error.line }) }}{{ error.text }} —— {{ error.reason }}
          </div>
        </n-alert>
      </div>
    </n-modal>
  </div>
</template>

<style lang="less" scoped>
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
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
}

.stat-sub {
  font-size: 12px;
  opacity: 0.6;
}

.stat-danger {
  color: #d03050;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px 0;
  opacity: 0.85;
}

.grid-scroll {
  overflow-x: auto;
  padding-bottom: 4px;
}

.tt-grid {
  display: grid;
  gap: 3px;
  min-width: 760px;
  grid-auto-rows: 54px;
}

.tt-corner,
.tt-head {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  opacity: 0.75;
}

.tt-time {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 54px;
  font-size: 12px;
  border-radius: 4px;
  background: rgba(128, 128, 128, 0.08);
}

.tt-cell {
  min-height: 54px;
  border-radius: 4px;
  background: rgba(128, 128, 128, 0.06);
  border: 1px dashed transparent;
}

.tt-block {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1px;
  margin-top: 1px;
  margin-bottom: 1px;
  padding: 4px 6px;
  border-left: 3px solid #888;
  border-radius: 4px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.12s ease;
}

.tt-block:hover {
  transform: scale(1.02);
  z-index: 3;
}

.tt-block-conflict {
  outline: 1.5px solid #d03050;
  outline-offset: -1.5px;
}

.tt-block-name {
  font-size: 12px;
  font-weight: 600;
  line-height: 1.25;
  word-break: break-all;
}

.tt-block-meta {
  font-size: 10px;
  opacity: 0.7;
  line-height: 1.2;
  word-break: break-all;
}

.free-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border-radius: 4px;
  background: rgba(24, 160, 88, 0.1);
  font-size: 13px;
}

.free-chip {
  padding: 1px 8px;
  border-radius: 10px;
  background: rgba(24, 160, 88, 0.22);
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
  padding: 8px 10px;
  font-weight: 600;
  font-size: 12px;
  opacity: 0.7;
  border-bottom: 1px solid rgba(128, 128, 128, 0.25);
  white-space: nowrap;
}

.data-table td {
  padding: 7px 10px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.14);
  white-space: nowrap;
}

.row-conflict td {
  background: rgba(208, 48, 80, 0.08);
}

.table-actions {
  display: flex;
  gap: 4px;
}

.color-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
  vertical-align: middle;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.import-example {
  padding: 8px 10px;
  margin-bottom: 8px;
  border-radius: 4px;
  background: rgba(128, 128, 128, 0.1);
  font-family: monospace;
  font-size: 12px;
  line-height: 1.7;
  white-space: pre-wrap;
}

.why-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.9;
  opacity: 0.85;
}
</style>
