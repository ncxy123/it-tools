export interface CourseSession {
  id: string
  name: string
  teacher?: string
  location?: string
  day: number
  startPeriod: number
  endPeriod: number
  weeks: number[]
  note?: string
}

export interface PeriodTime {
  start: string
  end: string
}

export interface TimetableMeta {
  semesterStart: string
  totalPeriods: number
  totalWeeks: number
  periodTimes: PeriodTime[]
}

export const WEEKDAY_LABELS_ZH = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

export const DEFAULT_PERIOD_TIMES: PeriodTime[] = [
  { start: '08:00', end: '08:45' },
  { start: '08:55', end: '09:40' },
  { start: '10:00', end: '10:45' },
  { start: '10:55', end: '11:40' },
  { start: '14:00', end: '14:45' },
  { start: '14:55', end: '15:40' },
  { start: '16:00', end: '16:45' },
  { start: '16:55', end: '17:40' },
  { start: '19:00', end: '19:45' },
  { start: '19:55', end: '20:40' },
  { start: '20:50', end: '21:35' },
  { start: '21:45', end: '22:30' },
];

export const DEFAULT_META: TimetableMeta = {
  semesterStart: '2026-09-07',
  totalPeriods: 12,
  totalWeeks: 20,
  periodTimes: DEFAULT_PERIOD_TIMES,
};

const DAY_ALIASES: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  日: 7,
  天: 7,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
  mon: 1,
  tue: 2,
  tues: 2,
  wed: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  fri: 5,
  sat: 6,
  sun: 7,
};

export function parseDay(raw: string | number): number | null {
  if (typeof raw === 'number') {
    return raw >= 1 && raw <= 7 ? Math.trunc(raw) : null;
  }
  if (!raw) {
    return null;
  }

  const text = String(raw)
    .trim()
    .toLowerCase()
    .replace(/[周星期礼拜\s.、,，]/g, '');

  if (!text) {
    return null;
  }

  if (/^[1-7]$/.test(text)) {
    return Number(text);
  }

  const hit = DAY_ALIASES[text];
  return hit ?? null;
}

export function parsePeriodRange(raw: string | number): { startPeriod: number; endPeriod: number } | null {
  if (raw === undefined || raw === null || raw === '') {
    return null;
  }

  const text = String(raw)
    .trim()
    .replace(/[第节堂小大课次]/g, '');

  const matched = text.match(/^(\d{1,2})\s*(?:[-~—至到,，、]\s*(\d{1,2}))?$/);
  if (!matched) {
    return null;
  }

  let startPeriod = Number(matched[1]);
  let endPeriod = matched[2] ? Number(matched[2]) : startPeriod;

  if (startPeriod > endPeriod) {
    [startPeriod, endPeriod] = [endPeriod, startPeriod];
  }

  if (startPeriod < 1) {
    return null;
  }

  return { startPeriod, endPeriod };
}

export function expandWeeks(raw: string | number[]): number[] {
  if (Array.isArray(raw)) {
    return [...new Set(raw.filter(w => Number.isInteger(w) && w > 0))].sort((a, b) => a - b);
  }
  if (raw === undefined || raw === null || raw === '') {
    return [];
  }

  const text = String(raw)
    .replace(/[周]/g, '')
    .replace(/[（）()【】[\]{}]/g, '');

  const tokens = text.split(/[,，、;；\s]+/).filter(Boolean);
  const result = new Set<number>();

  for (const token of tokens) {
    let parity: 'odd' | 'even' | null = null;
    if (/单/.test(token)) {
      parity = 'odd';
    }
    else if (/双/.test(token)) {
      parity = 'even';
    }

    const cleaned = token.replace(/[单双]/g, '');
    const range = cleaned.match(/^(\d{1,2})\s*[-~—至到]\s*(\d{1,2})$/);
    const single = cleaned.match(/^(\d{1,2})$/);

    let from: number;
    let to: number;

    if (range) {
      from = Number(range[1]);
      to = Number(range[2]);
    }
    else if (single) {
      from = Number(single[1]);
      to = from;
    }
    else {
      continue;
    }

    if (from > to) {
      [from, to] = [to, from];
    }

    for (let week = from; week <= to; week++) {
      if (week < 1 || week > 60) {
        continue;
      }
      if (parity === 'odd' && week % 2 === 0) {
        continue;
      }
      if (parity === 'even' && week % 2 !== 0) {
        continue;
      }
      result.add(week);
    }
  }

  return [...result].sort((a, b) => a - b);
}

export function formatWeeks(weeks: number[]): string {
  if (!weeks?.length) {
    return '—';
  }

  const sorted = [...new Set(weeks)].sort((a, b) => a - b);
  const runs: { values: number[]; step: number }[] = [];

  for (const week of sorted) {
    const last = runs.at(-1);
    if (last) {
      const step = week - last.values.at(-1)!;
      if ((step === 1 || step === 2) && (last.values.length === 1 || step === last.step)) {
        last.values.push(week);
        last.step = step;
        continue;
      }
    }
    runs.push({ values: [week], step: 1 });
  }

  return `${runs
    .map(({ values, step }) => {
      if (values.length === 1) {
        return `${values[0]}`;
      }
      const suffix = step === 2 ? (values[0] % 2 === 1 ? '单' : '双') : '';
      return `${values[0]}-${values.at(-1)}${suffix}`;
    })
    .join(',')}周`;
}

export interface ParseError {
  line: number
  text: string
  reason: string
}

export interface ParseResult {
  sessions: CourseSession[]
  errors: ParseError[]
}

const DELIMITER_PATTERN = /[|｜\t,，;；]+/;

let idSeed = 0;
export function createSessionId(): string {
  idSeed += 1;
  return `cs_${Date.now().toString(36)}_${idSeed.toString(36)}`;
}

function looksLikeLocation(field: string): boolean {
  return /楼|室|馆|场|厅|区|号|栋|教|座|机房|实验室|体育|操场|礼堂|食堂|报告厅|[A-Za-z]\s?-?\s?\d|\d{3}/.test(field);
}

export function parseCoursesFromText(text: string): ParseResult {
  const sessions: CourseSession[] = [];
  const errors: ParseError[] = [];

  const lines = String(text ?? '').split(/\r?\n/);

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) {
      return;
    }

    const fields = line
      .split(DELIMITER_PATTERN)
      .flatMap(f => (f.trim() ? [f.trim()] : []));

    const parts = fields.length >= 4
      ? fields
      : line.split(/\s{1,}/).flatMap(f => (f.trim() ? [f.trim()] : []));

    if (parts.length < 4) {
      errors.push({ line: index + 1, text: line, reason: '字段少于 4 个，无法识别（至少需要：课程名、星期、节次、周次）' });
      return;
    }

    const name = parts[0];
    let day: number | null = null;
    let period: { startPeriod: number; endPeriod: number } | null = null;
    let weeks: number[] = [];
    const leftovers: string[] = [];

    for (const field of parts.slice(1)) {
      const withoutLabel = field.replace(/^(周次|节次|星期|时间|地点|教室|教师|老师|任课)[:：]/, '');

      if (day === null) {
        const parsedDay = parseDay(withoutLabel);
        if (parsedDay !== null) {
          day = parsedDay;
          continue;
        }
      }

      if (!weeks.length && /周|单|双/.test(withoutLabel)) {
        const expanded = expandWeeks(withoutLabel);
        if (expanded.length) {
          weeks = expanded;
          continue;
        }
      }

      const locationLike = looksLikeLocation(withoutLabel);

      if (!period && !locationLike) {
        const parsedPeriod = parsePeriodRange(withoutLabel);
        if (parsedPeriod && parsedPeriod.endPeriod <= 20) {
          if (parsedPeriod.endPeriod > 12 && !weeks.length) {
            weeks = expandWeeks(withoutLabel);
          }
          else {
            period = parsedPeriod;
          }
          continue;
        }
      }

      if (!weeks.length && !locationLike) {
        const expanded = expandWeeks(withoutLabel);
        if (expanded.length) {
          weeks = expanded;
          continue;
        }
      }

      leftovers.push(field);
    }

    if (day === null) {
      errors.push({ line: index + 1, text: line, reason: '未能识别星期，请写成「周一」或「1」' });
      return;
    }
    if (!period) {
      errors.push({ line: index + 1, text: line, reason: '未能识别节次，请写成「1-2」或「3」' });
      return;
    }
    if (!weeks.length) {
      errors.push({ line: index + 1, text: line, reason: '未能识别周次，请写成「1-16」或「1-16周(单)」' });
      return;
    }

    const locationIndex = leftovers.findIndex(looksLikeLocation);
    let location = locationIndex >= 0 ? leftovers.splice(locationIndex, 1)[0] : undefined;
    if (!location && leftovers.length >= 2) {
      location = leftovers.shift();
    }
    const teacher = leftovers.shift();

    sessions.push({
      id: createSessionId(),
      name,
      teacher,
      location,
      day,
      startPeriod: period.startPeriod,
      endPeriod: period.endPeriod,
      weeks,
    });
  });

  return { sessions, errors };
}

export interface ConflictPair {
  day: number
  startPeriod: number
  endPeriod: number
  weeks: number[]
  a: CourseSession
  b: CourseSession
  sameCourse: boolean
}

function intersect(a: number[], b: number[]): number[] {
  const setB = new Set(b);
  return a.filter(x => setB.has(x)).sort((x, y) => x - y);
}

export function detectConflicts(sessions: CourseSession[]): ConflictPair[] {
  const conflicts: ConflictPair[] = [];

  for (let i = 0; i < sessions.length; i++) {
    for (let j = i + 1; j < sessions.length; j++) {
      const a = sessions[i];
      const b = sessions[j];

      if (a.day !== b.day) {
        continue;
      }

      const startPeriod = Math.max(a.startPeriod, b.startPeriod);
      const endPeriod = Math.min(a.endPeriod, b.endPeriod);
      if (startPeriod > endPeriod) {
        continue;
      }

      const weeks = intersect(a.weeks, b.weeks);
      if (!weeks.length) {
        continue;
      }

      conflicts.push({
        day: a.day,
        startPeriod,
        endPeriod,
        weeks,
        a,
        b,
        sameCourse: a.name.trim() === b.name.trim(),
      });
    }
  }

  return conflicts.sort((x, y) => x.day - y.day || x.startPeriod - y.startPeriod);
}

export function conflictedSessionIds(conflicts: ConflictPair[]): Set<string> {
  const ids = new Set<string>();
  for (const conflict of conflicts) {
    ids.add(conflict.a.id);
    ids.add(conflict.b.id);
  }
  return ids;
}

export interface FreeSlot {
  day: number
  startPeriod: number
  endPeriod: number
  length: number
}

export function computeBusyVector(
  sessions: CourseSession[],
  week: number,
  day: number,
  totalPeriods: number,
): boolean[] {
  const busy = Array.from({ length: totalPeriods }, () => false);

  for (const session of sessions) {
    if (session.day !== day || !session.weeks.includes(week)) {
      continue;
    }
    for (let p = session.startPeriod; p <= session.endPeriod; p++) {
      if (p >= 1 && p <= totalPeriods) {
        busy[p - 1] = true;
      }
    }
  }

  return busy;
}

export function computeFreeSlots(
  sessions: CourseSession[],
  week: number,
  options: { totalPeriods?: number; minLength?: number; days?: number[] } = {},
): FreeSlot[] {
  const { totalPeriods = 12, minLength = 1, days = [1, 2, 3, 4, 5, 6, 7] } = options;
  const result: FreeSlot[] = [];

  for (const day of days) {
    const busy = computeBusyVector(sessions, week, day, totalPeriods);

    let runStart = -1;
    for (let p = 0; p <= totalPeriods; p++) {
      const isFree = p < totalPeriods && !busy[p];

      if (isFree && runStart === -1) {
        runStart = p;
      }
      else if (!isFree && runStart !== -1) {
        const runEnd = p;
        const length = runEnd - runStart;
        if (length >= minLength) {
          result.push({ day, startPeriod: runStart + 1, endPeriod: runEnd, length });
        }
        runStart = -1;
      }
    }
  }

  return result;
}

export function formatFreeSlots(slots: FreeSlot[]): string[] {
  return [1, 2, 3, 4, 5, 6, 7]
    .map((day) => {
      const daySlots = slots.filter(s => s.day === day);
      if (!daySlots.length) {
        return `${WEEKDAY_LABELS_ZH[day - 1]}：无连续空闲`;
      }
      return `${WEEKDAY_LABELS_ZH[day - 1]}：${daySlots.map(s => `${s.startPeriod}-${s.endPeriod}节`).join(' · ')}`;
    })
    .filter(Boolean);
}

export interface TimetableStats {
  courseCount: number
  sessionCount: number
  totalWeeks: number
  busiestWeek: number
  busiestWeekPeriods: number
  averagePeriodsPerTeachingWeek: number
  conflictCount: number
  conflictedCourseCount: number
}

export function computeStats(sessions: CourseSession[], meta: TimetableMeta, conflicts: ConflictPair[]): TimetableStats {
  const courseNames = new Set(sessions.map(s => s.name.trim()));
  if (!sessions.length) {
    return {
      courseCount: 0,
      sessionCount: 0,
      totalWeeks: 0,
      busiestWeek: 0,
      busiestWeekPeriods: 0,
      averagePeriodsPerTeachingWeek: 0,
      conflictCount: 0,
      conflictedCourseCount: 0,
    };
  }

  const periodsByWeek = new Map<number, number>();
  for (const session of sessions) {
    const span = session.endPeriod - session.startPeriod + 1;
    for (const week of session.weeks) {
      periodsByWeek.set(week, (periodsByWeek.get(week) ?? 0) + span);
    }
  }

  let busiestWeek = 0;
  let busiestWeekPeriods = 0;
  for (const [week, periods] of periodsByWeek) {
    if (periods > busiestWeekPeriods) {
      busiestWeek = week;
      busiestWeekPeriods = periods;
    }
  }

  const teachingWeeks = periodsByWeek.size;
  const totalPeriods = [...periodsByWeek.values()].reduce((sum, n) => sum + n, 0);

  return {
    courseCount: courseNames.size,
    sessionCount: sessions.length,
    totalWeeks: teachingWeeks,
    busiestWeek,
    busiestWeekPeriods,
    averagePeriodsPerTeachingWeek: teachingWeeks ? Math.round((totalPeriods / teachingWeeks) * 10) / 10 : 0,
    conflictCount: conflicts.filter(c => !c.sameCourse).length,
    conflictedCourseCount: new Set(
      conflicts.filter(c => !c.sameCourse).flatMap(c => [c.a.id, c.b.id]),
    ).size,
  };
}

interface SharePayload {
  v: 1
  meta: TimetableMeta
  sessions: CourseSession[]
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(code: string): string {
  const normalized = code.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeShareCode(meta: TimetableMeta, sessions: CourseSession[]): string {
  const payload: SharePayload = {
    v: 1,
    meta,
    sessions: sessions.map(s => ({
      id: s.id,
      name: s.name,
      teacher: s.teacher,
      location: s.location,
      day: s.day,
      startPeriod: s.startPeriod,
      endPeriod: s.endPeriod,
      weeks: s.weeks,
      note: s.note,
    })),
  };
  return toBase64Url(JSON.stringify(payload));
}

export function decodeShareCode(code: string): SharePayload | null {
  try {
    const parsed = JSON.parse(fromBase64Url(code.trim())) as SharePayload;
    if (parsed?.v !== 1 || !Array.isArray(parsed.sessions)) {
      return null;
    }
    return {
      v: 1,
      meta: { ...DEFAULT_META, ...parsed.meta },
      sessions: parsed.sessions.map((session, index) => ({
        ...session,
        id: session.id || `imported_${index}`,
        weeks: Array.isArray(session.weeks) ? session.weeks : expandWeeks(String(session.weeks ?? '')),
      })),
    };
  }
  catch {
    return null;
  }
}

function escapeIcsText(text: string): string {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 73) {
    return line;
  }

  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;

  for (const char of line) {
    const size = encoder.encode(char).length;
    if (currentBytes + size > 73) {
      chunks.push(current);
      current = char;
      currentBytes = size;
    }
    else {
      current += char;
      currentBytes += size;
    }
  }
  chunks.push(current);

  return chunks.join('\r\n ');
}

function pad(number: number, width = 2): string {
  return String(number).padStart(width, '0');
}

function parseIsoDate(iso: string): Date | null {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? '').trim());
  if (!matched) {
    return null;
  }
  const date = new Date(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

function formatIcsDateTime(date: Date, time: string): string {
  const [hour = '00', minute = '00'] = String(time).split(':');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(Number(hour))}${pad(Number(minute))}00`;
}

export interface IcsOptions {
  sessions: CourseSession[]
  meta: TimetableMeta
  alarmMinutes?: number
  calendarName?: string
}

export function generateIcs({
  sessions,
  meta,
  alarmMinutes = 15,
  calendarName = '我的课表',
}: IcsOptions): string {
  const start = parseIsoDate(meta.semesterStart);
  const totalPeriods = Math.max(1, meta.totalPeriods);
  const periodTimes = meta.periodTimes?.length ? meta.periodTimes : DEFAULT_PERIOD_TIMES;

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Campus Toolbox//Timetable//CN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    'X-WR-TIMEZONE:Asia/Shanghai',
  ];

  if (!start) {
    lines.push('END:VCALENDAR');
    return `${lines.join('\r\n')}\r\n`;
  }

  const stampDate = new Date();
  const dtstamp = `${stampDate.getUTCFullYear()}${pad(stampDate.getUTCMonth() + 1)}${pad(stampDate.getUTCDate())}T${pad(stampDate.getUTCHours())}${pad(stampDate.getUTCMinutes())}${pad(stampDate.getUTCSeconds())}Z`;

  for (const session of sessions) {
    const startIndex = Math.min(Math.max(session.startPeriod, 1), totalPeriods) - 1;
    const endIndex = Math.min(Math.max(session.endPeriod, 1), totalPeriods) - 1;
    const startTime = periodTimes[startIndex]?.start ?? '08:00';
    const endTime = periodTimes[endIndex]?.end ?? '09:40';

    for (const week of session.weeks) {
      const dayOffset = (week - 1) * 7 + (session.day - 1);
      const date = addDays(start, dayOffset);

      lines.push(
        'BEGIN:VEVENT',
        `UID:${session.id}-w${week}@campus-toolbox`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART:${formatIcsDateTime(date, startTime)}`,
        `DTEND:${formatIcsDateTime(date, endTime)}`,
        `SUMMARY:${escapeIcsText(session.name)}`,
      );

      if (session.location) {
        lines.push(`LOCATION:${escapeIcsText(session.location)}`);
      }

      const description = [
        session.teacher ? `教师：${session.teacher}` : '',
        `第 ${week} 周 · ${WEEKDAY_LABELS_ZH[session.day - 1]} ${session.startPeriod}-${session.endPeriod} 节`,
        session.note ?? '',
      ].filter(Boolean).join('\n');

      lines.push(`DESCRIPTION:${escapeIcsText(description)}`);

      if (alarmMinutes > 0) {
        lines.push(
          'BEGIN:VALARM',
          `TRIGGER:-PT${Math.round(alarmMinutes)}M`,
          'ACTION:DISPLAY',
          `DESCRIPTION:${escapeIcsText(session.name)}`,
          'END:VALARM',
        );
      }

      lines.push('END:VEVENT');
    }
  }

  lines.push('END:VCALENDAR');

  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}

export function generateCsv(sessions: CourseSession[]): string {
  const header = ['课程名称', '星期', '节次', '周次', '地点', '教师', '备注'];
  const rows = sessions.map(session => [
    session.name,
    WEEKDAY_LABELS_ZH[session.day - 1] ?? '',
    `${session.startPeriod}-${session.endPeriod}`,
    formatWeeks(session.weeks),
    session.location ?? '',
    session.teacher ?? '',
    session.note ?? '',
  ]);

  const escape = (value: string) => `"${String(value).replace(/"/g, '""')}"`;

  return `\uFEFF${[header, ...rows].map(row => row.map(escape).join(',')).join('\r\n')}`;
}
