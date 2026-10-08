export interface GradeBand {
  min: number
  point: number
}

export interface ScaleRule {
  id: string
  name: string
  note: string
  bands: GradeBand[]
}

export type InputMode = 'auto' | 'percent' | 'level5' | 'letter';

export interface CourseGrade {
  id: string
  name: string
  credits: number | null
  raw: string
  included: boolean
}

const LEVEL5_TO_PERCENT: Record<string, number> = {
  优秀: 95,
  优: 95,
  a: 95,
  良好: 85,
  良: 85,
  b: 85,
  中等: 75,
  中: 75,
  c: 75,
  及格: 65,
  及: 65,
  d: 65,
  不及格: 50,
  不及: 50,
  差: 50,
  e: 50,
  f: 50,
};

const LETTER_TO_PERCENT: Record<string, number> = {
  'A+': 97,
  'A': 92,
  'A-': 88,
  'B+': 85,
  'B': 82,
  'B-': 78,
  'C+': 75,
  'C': 72,
  'C-': 68,
  'D+': 65,
  'D': 62,
  'D-': 60,
  'F': 50,
};

export const INPUT_MODES: { value: InputMode; label: string; hint: string }[] = [
  { value: 'auto', label: 'campus.gpa.mode.auto.label', hint: 'campus.gpa.mode.auto.hint' },
  { value: 'percent', label: 'campus.gpa.mode.percent.label', hint: 'campus.gpa.mode.percent.hint' },
  { value: 'level5', label: 'campus.gpa.mode.level5.label', hint: 'campus.gpa.mode.level5.hint' },
  { value: 'letter', label: 'campus.gpa.mode.letter.label', hint: 'campus.gpa.mode.letter.hint' },
];

function parseNumericScore(text: string): number | null {
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

export function toPercent(raw: string | number | null | undefined, mode: InputMode = 'auto'): number | null {
  if (raw === null || raw === undefined) {
    return null;
  }

  const text = String(raw).trim();
  if (!text) {
    return null;
  }

  if (mode === 'percent') {
    return parseNumericScore(text);
  }

  const normalized = text.replace(/[＾\s]/g, '');
  const upper = normalized.toUpperCase();

  if (mode === 'letter') {
    return LETTER_TO_PERCENT[upper] ?? parseNumericScore(text);
  }

  if (mode === 'level5') {
    return LEVEL5_TO_PERCENT[normalized] ?? parseNumericScore(text);
  }

  return parseNumericScore(text)
    ?? LETTER_TO_PERCENT[upper]
    ?? LEVEL5_TO_PERCENT[normalized]
    ?? null;
}

export function isValidScore(raw: string, mode: InputMode): boolean {
  return !raw.trim() || toPercent(raw, mode) !== null;
}

function linear50Bands(): GradeBand[] {
  const bands: GradeBand[] = [{ min: 0, point: 0 }];
  for (let score = 50; score <= 100; score++) {
    bands.push({ min: score, point: Math.round(((score - 50) / 10) * 10) / 10 });
  }
  return bands;
}

export const SCALE_RULES: ScaleRule[] = [
  {
    id: 'standard-4.0',
    name: 'campus.gpa.scale.standard40.name',
    note: 'campus.gpa.scale.standard40.note',
    bands: [
      { min: 90, point: 4.0 }, { min: 85, point: 3.7 }, { min: 82, point: 3.3 },
      { min: 78, point: 3.0 }, { min: 75, point: 2.7 }, { min: 72, point: 2.3 },
      { min: 68, point: 2.0 }, { min: 64, point: 1.5 }, { min: 60, point: 1.0 },
      { min: 0, point: 0 },
    ],
  },
  {
    id: 'pku-4.0',
    name: 'campus.gpa.scale.pku40.name',
    note: 'campus.gpa.scale.pku40.note',
    bands: [
      { min: 90, point: 4.0 }, { min: 85, point: 3.7 }, { min: 80, point: 3.3 },
      { min: 75, point: 3.0 }, { min: 70, point: 2.7 }, { min: 65, point: 2.3 },
      { min: 60, point: 1.0 }, { min: 0, point: 0 },
    ],
  },
  {
    id: 'strict-4.0',
    name: 'campus.gpa.scale.strict40.name',
    note: 'campus.gpa.scale.strict40.note',
    bands: [
      { min: 90, point: 4.0 }, { min: 80, point: 3.0 }, { min: 70, point: 2.0 },
      { min: 60, point: 1.0 }, { min: 0, point: 0 },
    ],
  },
  {
    id: 'linear-50',
    name: 'campus.gpa.scale.linear50.name',
    note: 'campus.gpa.scale.linear50.note',
    bands: linear50Bands(),
  },
  {
    id: 'five-point',
    name: 'campus.gpa.scale.fivePoint.name',
    note: 'campus.gpa.scale.fivePoint.note',
    bands: [
      { min: 90, point: 5.0 }, { min: 80, point: 4.0 }, { min: 70, point: 3.0 },
      { min: 60, point: 2.0 }, { min: 0, point: 0 },
    ],
  },
  {
    id: 'four-five',
    name: 'campus.gpa.scale.fourFive.name',
    note: 'campus.gpa.scale.fourFive.note',
    bands: [
      { min: 90, point: 4.5 }, { min: 85, point: 4.0 }, { min: 80, point: 3.5 },
      { min: 75, point: 3.0 }, { min: 70, point: 2.5 }, { min: 65, point: 2.0 },
      { min: 60, point: 1.5 }, { min: 0, point: 0 },
    ],
  },
  {
    id: 'custom',
    name: 'campus.gpa.scale.custom.name',
    note: 'campus.gpa.scale.custom.note',
    bands: [
      { min: 90, point: 4.0 }, { min: 80, point: 3.0 },
      { min: 70, point: 2.0 }, { min: 60, point: 1.0 }, { min: 0, point: 0 },
    ],
  },
];

export const DEFAULT_SCALE_ID = 'standard-4.0';

export function getScaleRule(id: string, customBands?: GradeBand[]): ScaleRule {
  const rule = SCALE_RULES.find(item => item.id === id) ?? SCALE_RULES[0];
  if (rule.id === 'custom' && customBands?.length) {
    return { ...rule, bands: normalizeBands(customBands) };
  }
  return rule;
}

export function normalizeBands(bands: GradeBand[]): GradeBand[] {
  return [...bands]
    .filter(band => Number.isFinite(band.min) && Number.isFinite(band.point))
    .sort((a, b) => b.min - a.min);
}

export function parseBandsText(text: string): GradeBand[] {
  return normalizeBands(
    String(text ?? '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [min, point] = line.split(/[:：,，\s]+/);
        return { min: Number(min), point: Number(point) };
      })
      .filter(band => Number.isFinite(band.min) && Number.isFinite(band.point)),
  );
}

export function bandsToText(bands: GradeBand[]): string {
  return normalizeBands(bands).map(band => `${band.min}:${band.point}`).join('\n');
}

export function resolvePoint(percent: number, rule: ScaleRule): number {
  const band = normalizeBands(rule.bands).find(item => percent >= item.min);
  return band ? band.point : 0;
}

export function minPercentForPoint(point: number, rule: ScaleRule): number | null {
  const candidates = normalizeBands(rule.bands)
    .filter(band => band.point >= point)
    .map(band => band.min);
  return candidates.length ? Math.min(...candidates) : null;
}

export interface CourseComputed {
  course: CourseGrade
  percent: number | null
  point: number | null
  qualityPoints: number | null
  counted: boolean
  error?: 'score' | 'credits'
}

export interface GpaResult {
  courses: CourseComputed[]
  countedCredits: number
  totalCredits: number
  weightedAverage: number | null
  gpa: number | null
  arithmeticAverage: number | null
  totalQualityPoints: number
  failedCount: number
  errorCount: number
}

export interface ComputeOptions {
  rule: ScaleRule
  mode: InputMode
  includeFailed: boolean
  passLine?: number
}

export const DEFAULT_OPTIONS: Omit<ComputeOptions, 'rule'> = {
  mode: 'auto',
  includeFailed: true,
  passLine: 60,
};

function round(value: number, digits = 2): number {
  return Math.round(value * 10 ** digits) / 10 ** digits;
}

export function computeGpa(courses: CourseGrade[], options: ComputeOptions): GpaResult {
  const { rule, mode, includeFailed, passLine = 60 } = options;

  const computed: CourseComputed[] = courses.map((course) => {
    const percent = toPercent(course.raw, mode);
    const credits = course.credits === null || course.credits === undefined ? null : Number(course.credits);

    if (!course.raw.trim()) {
      return { course, percent: null, point: null, qualityPoints: null, counted: false };
    }
    if (percent === null) {
      return { course, percent: null, point: null, qualityPoints: null, counted: false, error: 'score' };
    }
    if (credits === null || !Number.isFinite(credits) || credits <= 0) {
      return { course, percent, point: null, qualityPoints: null, counted: false, error: 'credits' };
    }

    const point = resolvePoint(percent, rule);
    const counted = course.included && (includeFailed || percent >= passLine);

    return {
      course,
      percent,
      point,
      qualityPoints: counted ? round(credits * point, 2) : null,
      counted,
    };
  });

  const valid = computed.filter(item => item.counted && item.percent !== null && item.qualityPoints !== null);

  const countedCredits = valid.reduce((sum, item) => sum + Number(item.course.credits), 0);
  const totalQualityPoints = valid.reduce((sum, item) => sum + (item.qualityPoints ?? 0), 0);
  const weightedSum = valid.reduce((sum, item) => sum + Number(item.course.credits) * (item.percent ?? 0), 0);

  const totalCredits = computed
    .filter(item => item.percent !== null && item.course.credits)
    .reduce((sum, item) => sum + Number(item.course.credits), 0);

  const failedCount = computed.filter(item => item.percent !== null && item.percent < passLine).length;
  const errorCount = computed.filter(item => item.error).length;

  return {
    courses: computed,
    countedCredits: round(countedCredits, 2),
    totalCredits: round(totalCredits, 2),
    weightedAverage: countedCredits > 0 ? round(weightedSum / countedCredits, 2) : null,
    gpa: countedCredits > 0 ? round(totalQualityPoints / countedCredits, 3) : null,
    arithmeticAverage: valid.length > 0
      ? round(valid.reduce((sum, item) => sum + (item.percent ?? 0), 0) / valid.length, 2)
      : null,
    totalQualityPoints: round(totalQualityPoints, 2),
    failedCount,
    errorCount,
  };
}

export interface TargetProjection {
  achieved: boolean
  impossible: boolean
  requiredPoint: number | null
  requiredPercent: number | null
  maxPoint: number
}

export function projectTargetGpa(
  result: GpaResult,
  rule: ScaleRule,
  targetGpa: number,
  remainingCredits: number,
): TargetProjection {
  const maxPoint = Math.max(...rule.bands.map(band => band.point), 0);
  const doneCredits = result.countedCredits;
  const currentPoints = result.totalQualityPoints;

  if (remainingCredits <= 0 || targetGpa > maxPoint) {
    const achieved = result.gpa !== null && result.gpa >= targetGpa;
    return {
      achieved,
      impossible: !achieved,
      requiredPoint: null,
      requiredPercent: null,
      maxPoint,
    };
  }

  const requiredPoint = ((targetGpa * (doneCredits + remainingCredits)) - currentPoints) / remainingCredits;
  const achieved = requiredPoint <= 0;

  return {
    achieved,
    impossible: requiredPoint > maxPoint,
    requiredPoint: Math.round(requiredPoint * 1000) / 1000,
    requiredPercent: achieved ? null : minPercentForPoint(requiredPoint, rule),
    maxPoint,
  };
}

export interface GradeParseError {
  line: number
  text: string
  reason: string
}

export function parseGradesFromText(text: string, mode: InputMode): { courses: CourseGrade[]; errors: GradeParseError[] } {
  const courses: CourseGrade[] = [];
  const errors: GradeParseError[] = [];
  let seed = 0;

  String(text ?? '')
    .split(/\r?\n/)
    .forEach((rawLine, index) => {
      const line = rawLine.trim();
      if (!line || line.startsWith('#') || line.startsWith('//')) {
        return;
      }

      const parts = line
        .split(/[|｜\t,，;；]+|\s{1,}/)
        .flatMap(part => (part.trim() ? [part.trim()] : []));

      if (parts.length < 3) {
        errors.push({ line: index + 1, text: line, reason: '字段不足三列，需要：课程名、学分、成绩' });
        return;
      }

      const [name, creditsPart, ...rest] = parts;
      const credits = Number(creditsPart);
      if (!Number.isFinite(credits) || credits <= 0) {
        errors.push({ line: index + 1, text: line, reason: `学分「${creditsPart}」不是正数` });
        return;
      }

      const scorePart = rest.join(' ').trim();
      if (toPercent(scorePart, mode) === null) {
        errors.push({ line: index + 1, text: line, reason: `成绩「${scorePart}」无法识别` });
        return;
      }

      seed += 1;
      courses.push({
        id: `g_${Date.now().toString(36)}_${seed.toString(36)}`,
        name,
        credits,
        raw: scorePart,
        included: true,
      });
    });

  return { courses, errors };
}

export function gradesToCsv(result: GpaResult): string {
  const header = ['课程名称', '学分', '原始成绩', '百分制', '绩点', '学分绩点', '是否计入'];
  const rows = result.courses.map(item => [
    item.course.name,
    item.course.credits === null ? '' : String(item.course.credits),
    item.course.raw,
    item.percent === null ? '' : String(item.percent),
    item.point === null ? '' : String(item.point),
    item.qualityPoints === null ? '' : String(item.qualityPoints),
    item.counted ? '是' : '否',
  ]);

  const escape = (value: string) => `"${String(value).replace(/"/g, '""')}"`;

  return `\uFEFF${[header, ...rows].map(row => row.map(escape).join(',')).join('\r\n')}`;
}

export function createGradeId(): string {
  return `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
