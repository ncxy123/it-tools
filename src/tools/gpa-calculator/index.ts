import { Calculator } from '@vicons/tabler';
import { defineTool } from '../tool';
import { translate } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: translate('tools.gpa-calculator.title'),
  path: '/gpa-calculator',
  description: translate('tools.gpa-calculator.description'),
  keywords: [
    '绩点',
    'GPA',
    '加权平均分',
    '学分',
    '平均学分绩点',
    '换算',
    '成绩',
    'campus',
    'grade',
    'credit',
    'average',
  ],
  component: () => import('./gpa-calculator.vue'),
  icon: Calculator,
  createdAt: new Date('2026-09-20'),
});
