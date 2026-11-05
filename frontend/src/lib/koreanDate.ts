// One way to show a date everywhere: "11월 4일", with the year only when it is not this year.
// A plain "2026-11-04" is read at noon so no time zone can move it to another day.
export function koreanDate(value: Date | string, now = new Date()) {
  const date = value instanceof Date
    ? value
    : new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return typeof value === 'string' ? value : '';
  const year = date.getFullYear() === now.getFullYear() ? '' : `${date.getFullYear()}년 `;
  return `${year}${date.getMonth() + 1}월 ${date.getDate()}일`;
}
