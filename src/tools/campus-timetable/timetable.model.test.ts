import { describe, expect, it } from 'vitest';
import {
  type CourseSession,
  DEFAULT_META,
  computeFreeSlots,
  computeStats,
  decodeShareCode,
  detectConflicts,
  encodeShareCode,
  expandWeeks,
  formatWeeks,
  generateCsv,
  generateIcs,
  parseCoursesFromText,
  parseDay,
  parsePeriodRange,
} from './timetable.model';

function session(partial: Partial<CourseSession> & { name: string; day: number; startPeriod: number; endPeriod: number; weeks: number[] }): CourseSession {
  return { id: `${partial.name}-${partial.day}-${partial.startPeriod}-${partial.weeks.join('_')}`, ...partial };
}

describe('parseDay', () => {
  it('识别中文星期写法', () => {
    expect(parseDay('周一')).toBe(1);
    expect(parseDay('星期一')).toBe(1);
    expect(parseDay('星期三')).toBe(3);
    expect(parseDay('礼拜五')).toBe(5);
    expect(parseDay('周日')).toBe(7);
    expect(parseDay('星期天')).toBe(7);
  });

  it('识别数字与英文', () => {
    expect(parseDay('1')).toBe(1);
    expect(parseDay(4)).toBe(4);
    expect(parseDay('Wed')).toBe(3);
    expect(parseDay('monday')).toBe(1);
  });

  it('无效输入返回 null', () => {
    expect(parseDay('第八天')).toBeNull();
    expect(parseDay('')).toBeNull();
    expect(parseDay('9')).toBeNull();
  });
});

describe('parsePeriodRange', () => {
  it('解析区间与单节', () => {
    expect(parsePeriodRange('1-2')).toEqual({ startPeriod: 1, endPeriod: 2 });
    expect(parsePeriodRange('第3-4节')).toEqual({ startPeriod: 3, endPeriod: 4 });
    expect(parsePeriodRange('5')).toEqual({ startPeriod: 5, endPeriod: 5 });
    expect(parsePeriodRange('3~4')).toEqual({ startPeriod: 3, endPeriod: 4 });
  });

  it('自动纠正倒序区间', () => {
    expect(parsePeriodRange('4-2')).toEqual({ startPeriod: 2, endPeriod: 4 });
  });

  it('无效输入返回 null', () => {
    expect(parsePeriodRange('上午')).toBeNull();
    expect(parsePeriodRange('')).toBeNull();
  });
});

describe('expandWeeks', () => {
  it('展开连续区间', () => {
    expect(expandWeeks('1-4')).toEqual([1, 2, 3, 4]);
    expect(expandWeeks('1-4周')).toEqual([1, 2, 3, 4]);
  });

  it('支持单双周', () => {
    expect(expandWeeks('1-8单')).toEqual([1, 3, 5, 7]);
    expect(expandWeeks('1-8双')).toEqual([2, 4, 6, 8]);
    expect(expandWeeks('1-16周(单)')).toEqual([1, 3, 5, 7, 9, 11, 13, 15]);
  });

  it('支持离散枚举与混合写法', () => {
    expect(expandWeeks('1,3,5')).toEqual([1, 3, 5]);
    expect(expandWeeks('1-3,6-8')).toEqual([1, 2, 3, 6, 7, 8]);
    expect(expandWeeks('1-4,6-8单')).toEqual([1, 2, 3, 4, 7]);
  });

  it('去重并排序', () => {
    expect(expandWeeks('3,1,2,2')).toEqual([1, 2, 3]);
  });

  it('非法输入返回空数组', () => {
    expect(expandWeeks('单周')).toEqual([]);
    expect(expandWeeks('')).toEqual([]);
  });
});

describe('formatWeeks', () => {
  it('把周次列表压回可读文本', () => {
    expect(formatWeeks([1, 2, 3, 4])).toBe('1-4周');
    expect(formatWeeks([1, 3, 5, 7])).toBe('1-7单周');
    expect(formatWeeks([2, 4, 6])).toBe('2-6双周');
    expect(formatWeeks([1, 2, 9])).toBe('1-2,9周');
  });

  it('空列表给出占位符', () => {
    expect(formatWeeks([])).toBe('—');
  });
});

describe('parseCoursesFromText', () => {
  it('解析竖线分隔的标准格式', () => {
    const { sessions, errors } = parseCoursesFromText(
      '高等数学 | 周一 | 1-2 | 1-16 | 教1-201 | 张伟',
    );
    expect(errors).toHaveLength(0);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      name: '高等数学',
      day: 1,
      startPeriod: 1,
      endPeriod: 2,
      location: '教1-201',
      teacher: '张伟',
    });
    expect(sessions[0].weeks).toHaveLength(16);
  });

  it('字段顺序可调换（按内容自动识别）', () => {
    const { sessions } = parseCoursesFromText('大学英语 | 3-4 | 周三 | 1-16周(单) | 外语楼302');
    expect(sessions[0]).toMatchObject({ name: '大学英语', day: 3, startPeriod: 3, endPeriod: 4, location: '外语楼302' });
    expect(sessions[0].weeks).toEqual([1, 3, 5, 7, 9, 11, 13, 15]);
  });

  it('兼容逗号、制表符与全角分隔符', () => {
    const { sessions } = parseCoursesFromText(
      '线性代数,周二,5-6,1-18,理科楼B101\n'
      + '军事理论\t周五\t9-10\t1-8\t礼堂',
    );
    expect(sessions).toHaveLength(2);
    expect(sessions[1]).toMatchObject({ name: '军事理论', day: 5, startPeriod: 9, endPeriod: 10, location: '礼堂' });
  });

  it('跳过注释与空行', () => {
    const { sessions, errors } = parseCoursesFromText('\n# 这是注释\n\n// 也是注释\n');
    expect(sessions).toHaveLength(0);
    expect(errors).toHaveLength(0);
  });

  it('对缺字段的行给出可定位的错误提示', () => {
    const { sessions, errors } = parseCoursesFromText('高等数学 | 周一');
    expect(sessions).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ line: 1, reason: expect.stringContaining('字段少于') });
  });

  it('区分「节次区间」与「周次区间」，避免误判', () => {
    const { sessions, errors } = parseCoursesFromText('体育 | 周四 | 3-4 | 1-16 | 操场');
    expect(errors).toHaveLength(0);
    expect(sessions[0]).toMatchObject({ startPeriod: 3, endPeriod: 4 });
    expect(sessions[0].weeks.at(-1)).toBe(16);
  });
});

describe('detectConflicts', () => {
  it('同天、同周、节次重叠时判为冲突', () => {
    const conflicts = detectConflicts([
      session({ name: 'A', day: 1, startPeriod: 1, endPeriod: 2, weeks: [1, 2, 3] }),
      session({ name: 'B', day: 1, startPeriod: 2, endPeriod: 3, weeks: [2, 3, 4] }),
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ day: 1, startPeriod: 2, endPeriod: 2, weeks: [2, 3], sameCourse: false });
  });

  it('单双周错峰排课不算冲突', () => {
    const conflicts = detectConflicts([
      session({ name: 'A', day: 1, startPeriod: 1, endPeriod: 2, weeks: [1, 3, 5] }),
      session({ name: 'B', day: 1, startPeriod: 1, endPeriod: 2, weeks: [2, 4, 6] }),
    ]);
    expect(conflicts).toHaveLength(0);
  });

  it('不同天、或节次不重叠时不算冲突', () => {
    expect(detectConflicts([
      session({ name: 'A', day: 1, startPeriod: 1, endPeriod: 2, weeks: [1] }),
      session({ name: 'B', day: 2, startPeriod: 1, endPeriod: 2, weeks: [1] }),
    ])).toHaveLength(0);

    expect(detectConflicts([
      session({ name: 'A', day: 1, startPeriod: 1, endPeriod: 2, weeks: [1] }),
      session({ name: 'B', day: 1, startPeriod: 3, endPeriod: 4, weeks: [1] }),
    ])).toHaveLength(0);
  });

  it('同一门课重叠会被标记为 sameCourse', () => {
    const conflicts = detectConflicts([
      session({ name: '高等数学', day: 1, startPeriod: 1, endPeriod: 2, weeks: [1] }),
      session({ name: ' 高等数学 ', day: 1, startPeriod: 1, endPeriod: 2, weeks: [1] }),
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].sameCourse).toBe(true);
  });
});

describe('computeFreeSlots', () => {
  const sessions = [
    session({ name: 'A', day: 1, startPeriod: 1, endPeriod: 2, weeks: [1] }),
    session({ name: 'B', day: 1, startPeriod: 5, endPeriod: 6, weeks: [1] }),
  ];

  it('找出连续空闲节次块', () => {
    const slots = computeFreeSlots(sessions, 1, { totalPeriods: 8, minLength: 1, days: [1] });
    expect(slots).toEqual([
      { day: 1, startPeriod: 3, endPeriod: 4, length: 2 },
      { day: 1, startPeriod: 7, endPeriod: 8, length: 2 },
    ]);
  });

  it('minLength 过滤掉过短的碎片时间', () => {
    const slots = computeFreeSlots(sessions, 1, { totalPeriods: 8, minLength: 3, days: [1] });
    expect(slots).toEqual([]);
  });

  it('没有课的周次整天都是空闲', () => {
    const slots = computeFreeSlots(sessions, 2, { totalPeriods: 4, minLength: 1, days: [1] });
    expect(slots).toEqual([{ day: 1, startPeriod: 1, endPeriod: 4, length: 4 }]);
  });

  it('跨节次的课会整段占满', () => {
    const slots = computeFreeSlots(
      [session({ name: 'A', day: 3, startPeriod: 3, endPeriod: 4, weeks: [1] })],
      1,
      { totalPeriods: 6, minLength: 1, days: [3] },
    );
    expect(slots).toEqual([
      { day: 3, startPeriod: 1, endPeriod: 2, length: 2 },
      { day: 3, startPeriod: 5, endPeriod: 6, length: 2 },
    ]);
  });
});

describe('encodeShareCode / decodeShareCode', () => {
  it('可以完整往返', () => {
    const sessions = [
      session({ name: '高等数学', teacher: '张伟', location: '教1-201', day: 1, startPeriod: 1, endPeriod: 2, weeks: [1, 2, 3] }),
      session({ name: '体育', day: 4, startPeriod: 3, endPeriod: 4, weeks: [2, 4] }),
    ];
    const code = encodeShareCode(DEFAULT_META, sessions);
    expect(code).toMatch(/^[A-Za-z0-9\-_]+$/);

    const decoded = decodeShareCode(code);
    expect(decoded).not.toBeNull();
    expect(decoded!.sessions).toHaveLength(2);
    expect(decoded!.sessions[0]).toMatchObject({ name: '高等数学', teacher: '张伟', location: '教1-201', weeks: [1, 2, 3] });
  });

  it('对损坏的分享码返回 null 而不是抛异常', () => {
    expect(decodeShareCode('这不是合法的分享码')).toBeNull();
    expect(decodeShareCode('')).toBeNull();
  });
});

describe('generateIcs', () => {
  it('生成结构合法的 ICS，并按周展开事件', () => {
    const ics = generateIcs({
      sessions: [session({ name: '高等数学', teacher: '张伟', location: '教1-201', day: 1, startPeriod: 1, endPeriod: 2, weeks: [1, 2] })],
      meta: { ...DEFAULT_META, semesterStart: '2026-09-07' },
      alarmMinutes: 15,
    });

    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain('DTSTART:20260907T080000');
    expect(ics).toContain('DTEND:20260907T094000');
    expect(ics).toContain('DTSTART:20260914T080000');
    expect(ics).toContain('SUMMARY:高等数学');
    expect(ics).toContain('LOCATION:教1-201');
    expect(ics).toContain('TRIGGER:-PT15M');
  });

  it('转义 ICS 特殊字符', () => {
    const ics = generateIcs({
      sessions: [session({ name: '数学,分析;A', location: '教1-201', day: 1, startPeriod: 1, endPeriod: 1, weeks: [1] })],
      meta: DEFAULT_META,
      alarmMinutes: 0,
    });
    expect(ics).toContain('SUMMARY:数学\\,分析\\;A');
    expect(ics).not.toContain('BEGIN:VALARM');
  });

  it('学期开始日期非法时返回可解析的空日历', () => {
    const ics = generateIcs({
      sessions: [session({ name: 'A', day: 1, startPeriod: 1, endPeriod: 1, weeks: [1] })],
      meta: { ...DEFAULT_META, semesterStart: '不是日期' },
    });
    expect(ics).not.toContain('BEGIN:VEVENT');
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
  });
});

describe('generateCsv', () => {
  it('带 BOM 与正确的引号转义', () => {
    const csv = generateCsv([
      session({ name: '数学"分析"', location: '教1-201', day: 1, startPeriod: 1, endPeriod: 2, weeks: [1, 2] }),
    ]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"数学""分析"""');
    expect(csv).toContain('"周一"');
    expect(csv).toContain('"1-2周"');
  });
});

describe('computeStats', () => {
  it('统计课程数、最忙周与冲突数', () => {
    const sessions = [
      session({ name: 'A', day: 1, startPeriod: 1, endPeriod: 2, weeks: [1, 2] }),
      session({ name: 'B', day: 2, startPeriod: 1, endPeriod: 2, weeks: [1] }),
      session({ name: 'C', day: 2, startPeriod: 3, endPeriod: 4, weeks: [1] }),
    ];
    const conflicts = detectConflicts(sessions);
    const stats = computeStats(sessions, DEFAULT_META, conflicts);

    expect(stats.courseCount).toBe(3);
    expect(stats.sessionCount).toBe(3);
    expect(stats.totalWeeks).toBe(2);
    expect(stats.busiestWeek).toBe(1);
    expect(stats.busiestWeekPeriods).toBe(6);
    expect(stats.conflictCount).toBe(0);
  });

  it('空课表不会除零', () => {
    const stats = computeStats([], DEFAULT_META, []);
    expect(stats).toMatchObject({ courseCount: 0, sessionCount: 0, averagePeriodsPerTeachingWeek: 0 });
  });
});
