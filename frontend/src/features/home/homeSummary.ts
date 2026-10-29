// Small date helpers for the home screen's "today" and "this week" cards.
export const weekdayLabels = ['월', '화', '수', '목', '금', '토', '일'] as const;
const dayNames = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

export function localDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function koreanDateLabel(date: Date): string {
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${dayNames[date.getDay()]}`;
}

// Monday is the first day of the week, as in the Figma week row.
export function weekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export function mondayOf(date: Date): Date {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - weekdayIndex(monday));
  return monday;
}

export function sundayOf(date: Date): Date {
  const sunday = mondayOf(date);
  sunday.setDate(sunday.getDate() + 6);
  return sunday;
}

type HistoryRow = { session: Record<string, unknown> };

function isCompleted(session: Record<string, unknown>) {
  return session.status === 'completed' || typeof session.completed_at === 'string';
}

// Which days of this week have a finished workout, and how many minutes in total.
export function summarizeWeek(history: HistoryRow[], today: Date) {
  const monday = mondayOf(today);
  const doneDays: boolean[] = Array.from({ length: 7 }, () => false);
  let seconds = 0;
  let hasDuration = false;
  for (const { session } of history) {
    if (!isCompleted(session)) continue;
    const raw = session.started_at ?? session.created_at;
    if (typeof raw !== 'string') continue;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) continue;
    const day = Math.floor((mondayOf(date).getTime() - monday.getTime()) / 86400000);
    if (day !== 0) continue;
    doneDays[weekdayIndex(date)] = true;
    const duration = Number(session.total_duration_seconds);
    if (Number.isFinite(duration) && duration > 0) {
      seconds += duration;
      hasDuration = true;
    }
  }
  return { doneDays, minutes: hasDuration ? Math.round(seconds / 60) : null };
}
