import { CalendarEvent } from '@vicons/tabler';
import { defineTool } from '../tool';
import { translate } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: translate('tools.campus-timetable.title'),
  path: '/campus-timetable',
  description: translate('tools.campus-timetable.description'),
  keywords: [
    '课表',
    '课程表',
    '冲突',
    '空闲',
    '时间表',
    'timetable',
    'schedule',
    'campus',
    'conflict',
    'free slot',
    '校园',
  ],
  component: () => import('./campus-timetable.vue'),
  icon: CalendarEvent,
  createdAt: new Date('2026-09-20'),
});
