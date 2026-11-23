// Renewal B's community headline, from the first page of the feed only: what it cannot know it does not say.
// A count is exact when the page ends (no next page) or already reaches a post from before today;
// otherwise it says "N개 넘게". following: how many of the people I follow wrote today.
type Item = { post_id: string; created_at: string; author: { user_id: string } };
type Part = { text: string; mark?: boolean };

const ASK: Part[][] = [[{ text: '오늘의 운동을' }], [{ text: '나눠 보세요' }]];

const sameDay = (iso: string, now: Date) => {
  const day = new Date(iso);
  return day.getFullYear() === now.getFullYear() && day.getMonth() === now.getMonth() && day.getDate() === now.getDate();
};

// The lines for the Headline (a lilac mark under the number); nothing today: an invitation to write.
export function feedHeadline(items: Item[], more: boolean, following: boolean, now = new Date()): Part[][] {
  const today = items.filter((item) => sameDay(item.created_at, now));
  const exact = !more || today.length < items.length;
  if (following) {
    const people = new Set(today.map((item) => item.author.user_id)).size;
    if (!people) return ASK;
    return [[{ text: '팔로우한 ' }, { text: `${people}명${exact ? '' : ' 넘게'}`, mark: true }, ...(exact ? [{ text: '이' }] : [])], [{ text: '오늘 글을 올렸어요' }]];
  }
  const posts = new Set(today.map((item) => item.post_id)).size;
  if (!posts) return ASK;
  return [[{ text: '오늘 새 글이' }], [{ text: `${posts}개${exact ? '' : ' 넘게'}`, mark: true }, { text: ' 올라왔어요' }]];
}
