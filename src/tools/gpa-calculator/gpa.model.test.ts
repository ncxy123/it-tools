import { describe, expect, it } from 'vitest';
import {
  type CourseGrade,
  DEFAULT_OPTIONS,
  DEFAULT_SCALE_ID,
  bandsToText,
  computeGpa,
  getScaleRule,
  gradesToCsv,
  minPercentForPoint,
  normalizeBands,
  parseBandsText,
  parseGradesFromText,
  projectTargetGpa,
  resolvePoint,
  toPercent,
} from './gpa.model';

function grade(name: string, credits: number | null, raw: string, included = true): CourseGrade {
  return { id: `${name}-${raw}`, name, credits, raw, included };
}

describe('toPercent 录入换算', () => {
  it('百分制直接取数字并做范围校验', () => {
    expect(toPercent('87', 'percent')).toBe(87);
    expect(toPercent('87.5', 'percent')).toBe(87.5);
    expect(toPercent('101', 'percent')).toBeNull();
    expect(toPercent('abc', 'percent')).toBeNull();
  });

  it('五级制折算成百分制', () => {
    expect(toPercent('优秀', 'level5')).toBe(95);
    expect(toPercent('良', 'level5')).toBe(85);
    expect(toPercent('中等', 'level5')).toBe(75);
    expect(toPercent('及格', 'level5')).toBe(65);
    expect(toPercent('不及格', 'level5')).toBe(50);
    expect(toPercent('乱写', 'level5')).toBeNull();
  });

  it('字母等级折算成百分制，且大小写不敏感', () => {
    expect(toPercent('A+', 'letter')).toBe(97);
    expect(toPercent('a-', 'letter')).toBe(88);
    expect(toPercent('B+', 'letter')).toBe(85);
    expect(toPercent('F', 'letter')).toBe(50);
  });

  it('空值与空白返回 null', () => {
    expect(toPercent('', 'percent')).toBeNull();
    expect(toPercent(null, 'percent')).toBeNull();
    expect(toPercent('   ', 'level5')).toBeNull();
  });
});

describe('resolvePoint 分段换算', () => {
  it('通用 4.0 制按区间取绩点', () => {
    const rule = getScaleRule('standard-4.0');
    expect(resolvePoint(95, rule)).toBe(4.0);
    expect(resolvePoint(90, rule)).toBe(4.0);
    expect(resolvePoint(89.9, rule)).toBe(3.7);
    expect(resolvePoint(85, rule)).toBe(3.7);
    expect(resolvePoint(60, rule)).toBe(1.0);
    expect(resolvePoint(59, rule)).toBe(0);
    expect(resolvePoint(0, rule)).toBe(0);
  });

  it('线性折算公式可得 (成绩−50)/10', () => {
    const rule = getScaleRule('linear-50');
    expect(resolvePoint(60, rule)).toBe(1.0);
    expect(resolvePoint(75, rule)).toBe(2.5);
    expect(resolvePoint(90, rule)).toBe(4.0);
    expect(resolvePoint(100, rule)).toBe(5.0);
    expect(resolvePoint(50, rule)).toBe(0);
  });

  it('自定义规则会按区间下限自动降序排列', () => {
    const rule = getScaleRule('custom', [{ min: 60, point: 1 }, { min: 90, point: 4 }, { min: 0, point: 0 }]);
    expect(rule.bands[0].min).toBe(90);
    expect(resolvePoint(95, rule)).toBe(4);
    expect(resolvePoint(70, rule)).toBe(1);
  });

  it('minPercentForPoint 反查最低所需分数', () => {
    const rule = getScaleRule('standard-4.0');
    expect(minPercentForPoint(3.7, rule)).toBe(85);
    expect(minPercentForPoint(4.0, rule)).toBe(90);
    expect(minPercentForPoint(4.7, rule)).toBeNull();
  });
});

describe('normalizeBands / parseBandsText / bandsToText', () => {
  it('过滤非法项并降序排序', () => {
    const bands = normalizeBands([
      { min: 60, point: 1 },
      { min: 90, point: 4 },
      { min: Number.NaN, point: 2 },
      { min: 0, point: 0 },
    ]);
    expect(bands.map(b => b.min)).toEqual([90, 60, 0]);
  });

  it('文本与结构可以互相转换', () => {
    const bands = parseBandsText('90:4.0\n80:3.0\n\n60:1.0\n70:2.0');
    expect(bands).toEqual([
      { min: 90, point: 4 },
      { min: 80, point: 3 },
      { min: 70, point: 2 },
      { min: 60, point: 1 },
    ]);
    expect(bandsToText(bands)).toBe('90:4\n80:3\n70:2\n60:1');
  });

  it('兼容中文冒号与全角逗号', () => {
    expect(parseBandsText('90：4.0\n80：3.0')).toEqual([
      { min: 90, point: 4 },
      { min: 80, point: 3 },
    ]);
    expect(parseBandsText('90,4.0\n80,3.0')).toEqual([
      { min: 90, point: 4 },
      { min: 80, point: 3 },
    ]);
  });
});

describe('computeGpa 汇总计算', () => {
  const rule = getScaleRule(DEFAULT_SCALE_ID);

  it('按学分加权计算 GPA 与加权平均分', () => {
    const result = computeGpa(
      [grade('高数', 5, '92'), grade('英语', 3, '85'), grade('体育', 1, '78')],
      { ...DEFAULT_OPTIONS, rule },
    );

    expect(result.countedCredits).toBe(9);
    expect(result.totalQualityPoints).toBe(34.1);
    expect(result.gpa).toBe(3.789);
    expect(result.weightedAverage).toBe(88.11);
    expect(result.arithmeticAverage).toBe(85);
    expect(result.failedCount).toBe(0);
  });

  it('算术平均分与加权平均分在学分不等时应当不同', () => {
    const result = computeGpa(
      [grade('A', 6, '60'), grade('B', 1, '100')],
      { ...DEFAULT_OPTIONS, rule },
    );
    expect(result.arithmeticAverage).toBe(80);
    expect(result.weightedAverage).toBe(65.71);
  });

  it('included=false 的课程不计入统计但仍保留在明细里', () => {
    const result = computeGpa(
      [grade('高数', 4, '90'), grade('任选课', 2, '60', false)],
      { ...DEFAULT_OPTIONS, rule },
    );
    expect(result.countedCredits).toBe(4);
    expect(result.gpa).toBe(4);
    expect(result.courses).toHaveLength(2);
    expect(result.courses[1].counted).toBe(false);
  });

  it('includeFailed=false 时不及格课程被排除，GPA 不会被拉低', () => {
    const courses = [grade('高数', 4, '90'), grade('物理', 4, '30')];

    const withFailed = computeGpa(courses, { ...DEFAULT_OPTIONS, rule, includeFailed: true });
    expect(withFailed.gpa).toBe(2);
    expect(withFailed.failedCount).toBe(1);

    const withoutFailed = computeGpa(courses, { ...DEFAULT_OPTIONS, rule, includeFailed: false });
    expect(withoutFailed.gpa).toBe(4);
    expect(withoutFailed.countedCredits).toBe(4);
    expect(withoutFailed.failedCount).toBe(1);
  });

  it('五级制录入也能正确汇总', () => {
    const result = computeGpa(
      [grade('高数', 4, '优秀'), grade('英语', 2, '良好')],
      { ...DEFAULT_OPTIONS, rule, mode: 'level5' },
    );
    expect(result.gpa).toBe(3.9);
    expect(result.weightedAverage).toBe(91.67);
  });

  it('标记出成绩或学分有问题的行，并且不让它们污染结果', () => {
    const result = computeGpa(
      [grade('高数', 4, '90'), grade('手滑', 4, '错'), grade('缺学分', null, '88')],
      { ...DEFAULT_OPTIONS, rule },
    );
    expect(result.errorCount).toBe(2);
    expect(result.gpa).toBe(4);
    expect(result.courses[1].error).toBe('score');
    expect(result.courses[2].error).toBe('credits');
  });

  it('未填成绩的行被忽略', () => {
    const result = computeGpa(
      [grade('高数', 4, '90'), grade('待出分', 3, '')],
      { ...DEFAULT_OPTIONS, rule },
    );
    expect(result.gpa).toBe(4);
    expect(result.courses[1].counted).toBe(false);
    expect(result.courses[1].error).toBeUndefined();
  });

  it('没有有效课程时结果为 null 而不是 NaN 或除零', () => {
    const result = computeGpa([], { ...DEFAULT_OPTIONS, rule });
    expect(result.gpa).toBeNull();
    expect(result.weightedAverage).toBeNull();
    expect(result.arithmeticAverage).toBeNull();
    expect(result.countedCredits).toBe(0);
  });
});

describe('projectTargetGpa 目标反推', () => {
  const rule = getScaleRule('standard-4.0');

  it('计算剩余学分需要达到的平均绩点与对应分数', () => {
    const result = computeGpa([grade('高数', 10, '85')], { ...DEFAULT_OPTIONS, rule });
    expect(result.gpa).toBe(3.7);

    const projection = projectTargetGpa(result, rule, 3.8, 10);
    expect(projection.requiredPoint).toBe(3.9);
    expect(projection.achieved).toBe(false);
    expect(projection.impossible).toBe(false);
    expect(projection.requiredPercent).toBe(90);
  });

  it('目标已经达成时给出 achieved', () => {
    const result = computeGpa([grade('高数', 10, '95')], { ...DEFAULT_OPTIONS, rule });
    const projection = projectTargetGpa(result, rule, 1.5, 10);
    expect(projection.achieved).toBe(true);
    expect(projection.requiredPoint).toBeLessThan(0);
  });

  it('目标超过满绩点时判定为不可能', () => {
    const result = computeGpa([grade('高数', 10, '60')], { ...DEFAULT_OPTIONS, rule });
    const projection = projectTargetGpa(result, rule, 4.0, 10);
    expect(projection.impossible).toBe(true);
    expect(projection.achieved).toBe(false);
  });
});

describe('parseGradesFromText 批量导入', () => {
  it('解析「课程名 学分 成绩」三列', () => {
    const { courses, errors } = parseGradesFromText('高等数学 5 92\n大学英语,3,85', 'percent');
    expect(errors).toHaveLength(0);
    expect(courses).toHaveLength(2);
    expect(courses[0]).toMatchObject({ name: '高等数学', credits: 5, raw: '92' });
    expect(courses[1]).toMatchObject({ name: '大学英语', credits: 3, raw: '85' });
  });

  it('五级制模式下识别中文等级', () => {
    const { courses, errors } = parseGradesFromText('体育 | 1 | 优秀', 'level5');
    expect(errors).toHaveLength(0);
    expect(courses[0]).toMatchObject({ name: '体育', credits: 1, raw: '优秀' });
  });

  it('对问题行给出带行号的错误', () => {
    const { courses, errors } = parseGradesFromText('高等数学 5 92\n英语 abc 85\n物理 3 乱写', 'percent');
    expect(courses).toHaveLength(1);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatchObject({ line: 2, reason: expect.stringContaining('学分') });
    expect(errors[1]).toMatchObject({ line: 3, reason: expect.stringContaining('成绩') });
  });

  it('跳过空行与注释', () => {
    const { courses, errors } = parseGradesFromText('# 注释\n\n// 注释\n', 'percent');
    expect(courses).toHaveLength(0);
    expect(errors).toHaveLength(0);
  });
});

describe('gradesToCsv', () => {
  it('带 BOM，并正确转义引号', () => {
    const rule = getScaleRule(DEFAULT_SCALE_ID);
    const result = computeGpa([grade('数据"结构"', 3, '88')], { ...DEFAULT_OPTIONS, rule });
    const csv = gradesToCsv(result);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"数据""结构"""');
    expect(csv).toContain('"3.7"');
  });
});

describe('auto 录入模式', () => {
  it('是默认模式，不传 mode 也能认中文等级', () => {
    expect(DEFAULT_OPTIONS.mode).toBe('auto');
    expect(toPercent('优秀')).toBe(95);
  });

  it('数字、字母等级、五级制可以混着填', () => {
    expect(toPercent('92', 'auto')).toBe(92);
    expect(toPercent('A+', 'auto')).toBe(97);
    expect(toPercent('B+', 'auto')).toBe(85);
    expect(toPercent('及格', 'auto')).toBe(65);
    expect(toPercent('f', 'auto')).toBe(50);
  });

  it('一张表里混合三种写法也能算，且不报错', () => {
    const rule = getScaleRule(DEFAULT_SCALE_ID);
    const result = computeGpa(
      [grade('高等数学A', 5, '92'), grade('体育', 1, '优秀'), grade('大学英语', 3, 'B+')],
      { ...DEFAULT_OPTIONS, rule },
    );
    expect(result.errorCount).toBe(0);
    expect(result.courses.map(item => item.percent)).toEqual([92, 95, 85]);
  });

  it('认不出来才返回 null，不被当成 0 分', () => {
    expect(toPercent('乱写', 'auto')).toBeNull();
    expect(toPercent('120', 'auto')).toBeNull();
    expect(toPercent('-5', 'auto')).toBeNull();
  });

  it('百分制模式下仍然只认数字，保留严格口径', () => {
    expect(toPercent('优秀', 'percent')).toBeNull();
    expect(toPercent('85', 'percent')).toBe(85);
  });
});

describe('学分绩点取整', () => {
  it('不出现 11.100000000000001 这类浮点尾巴', () => {
    const rule = getScaleRule(DEFAULT_SCALE_ID);
    const result = computeGpa([grade('大学英语', 3, '85')], { ...DEFAULT_OPTIONS, rule });
    const qualityPoints = result.courses[0].qualityPoints;
    expect(qualityPoints).toBe(11.1);
    expect(String(qualityPoints)).toBe('11.1');
  });
});
