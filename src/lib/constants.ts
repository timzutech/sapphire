export const WEEKDAYS = [
  { value: '1', label: 'Monday' }, { value: '2', label: 'Tuesday' }, { value: '3', label: 'Wednesday' }, { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' }, { value: '6', label: 'Saturday' }, { value: '7', label: 'Sunday' },
];

export const RANGE_OPTIONS = [
  { value: 'this_week', label: 'This week' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_90', label: 'Last 90 days' },
  { value: 'this_year', label: 'This year' },
  { value: 'custom', label: 'Custom range' },
];

export const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }, { value: 'urgent', label: 'Urgent' },
];

export const TASK_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' }, { value: 'in_progress', label: 'In progress' }, { value: 'completed', label: 'Completed' }, { value: 'cancelled', label: 'Cancelled' },
];

export const ATTENDANCE_STATUS_OPTIONS = [
  { value: 'present', label: 'Present' }, { value: 'late', label: 'Late' }, { value: 'absent', label: 'Absent' }, { value: 'excused', label: 'Excused' },
];

export const ACTIVITY_KIND_LABELS: Record<string, string> = {
  training: 'Training', workshop: 'Workshop', prospecting: 'Prospecting / scouting', meeting: 'Office meeting', incentive: 'Incentive',
  challenge: 'Money-making challenge', development: 'Personal development', deadline: 'Deadline', announcement: 'Announcement',
};

export const GOAL_CATEGORY_LABELS: Record<string, string> = {
  progression: 'Members progressing a level', earnings: 'Office earnings', active_members: 'Active members', prospecting: 'Prospecting activity',
  conversion: 'Conversions', training: 'Training participation', tools: 'New tools or systems adopted', personal_development: 'Personal development',
  team_performance: 'Team performance', challenges: 'Money-making challenges', attendance: 'Attendance', tasks: 'Tasks', other: 'Other',
};

export const PROSPECT_SORT_OPTIONS = [
  { value: 'followup', label: 'Next follow-up' }, { value: 'recent', label: 'Recently added' }, { value: 'contact', label: 'Last contact' },
  { value: 'value', label: 'Estimated value' }, { value: 'name', label: 'Name' },
];
