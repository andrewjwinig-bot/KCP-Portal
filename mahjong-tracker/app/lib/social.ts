// Local social layer (prototype). Models a group, its members, and a shared
// feed entirely on-device — seeded with a few demo group-mates so the feed +
// leaderboard feel alive. This is the swap point for a real backend (v2):
// replace these reads/writes with Supabase queries and the UI stays identical.

import { getMeta, setMeta } from './storage';
import { CATEGORY_THEMES } from './theme';

export interface GroupMember {
  id: string;
  name: string;
  avatarColor: string;
  isYou: boolean;
  /** Seeded stats for demo members; for "you" these are computed live. */
  handsCleared: number;
  points: number;
}

export interface FeedPost {
  id: string;
  memberId: string;
  memberName: string;
  avatarColor: string;
  handLabel: string | null;
  note: string;
  photo: Blob | null;
  createdAt: number;
  /** Local moderation: hidden posts are kept but not shown. */
  hidden?: boolean;
}

export interface Group {
  id: string;
  name: string;
  inviteCode: string;
}

const K_SEEDED = 'social.seeded';
const K_GROUP = 'social.group';
const K_MEMBERS = 'social.members';
const K_FEED = 'social.feed';
const K_YOU_NAME = 'social.youName';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function color(i: number) {
  return CATEGORY_THEMES[i % CATEGORY_THEMES.length].accent;
}

export const YOU_ID = 'you';

async function seedIfNeeded(): Promise<void> {
  if (await getMeta<boolean>(K_SEEDED, false)) return;
  const now = Date.now();

  const group: Group = { id: 'grp_demo', name: 'Tuesday Game', inviteCode: 'MAHJ-2026' };

  const members: GroupMember[] = [
    { id: YOU_ID, name: 'You', avatarColor: color(0), isYou: true, handsCleared: 0, points: 0 },
    { id: 'm_sandra', name: 'Sandra', avatarColor: color(3), isYou: false, handsCleared: 31, points: 845 },
    { id: 'm_bev', name: 'Bev', avatarColor: color(1), isYou: false, handsCleared: 27, points: 720 },
    { id: 'm_marsha', name: 'Marsha', avatarColor: color(4), isYou: false, handsCleared: 24, points: 610 },
    { id: 'm_lois', name: 'Lois', avatarColor: color(2), isYou: false, handsCleared: 19, points: 505 },
  ];

  const feed: FeedPost[] = [
    {
      id: 'f1', memberId: 'm_sandra', memberName: 'Sandra', avatarColor: color(3),
      handLabel: 'FFF 2026 222 6666', note: 'Cleared another 2026 — only 4 to go!', photo: null,
      createdAt: now - 2 * HOUR,
    },
    {
      id: 'f2', memberId: 'm_bev', memberName: 'Bev', avatarColor: color(1),
      handLabel: '11 333 55 777 9999', note: 'Singles night came through 🎉', photo: null,
      createdAt: now - 6 * HOUR,
    },
    {
      id: 'f3', memberId: 'm_marsha', memberName: 'Marsha', avatarColor: color(4),
      handLabel: 'NNNN EEE WWW SSSS', note: '', photo: null,
      createdAt: now - 1 * DAY - 3 * HOUR,
    },
    {
      id: 'f4', memberId: 'm_lois', memberName: 'Lois', avatarColor: color(2),
      handLabel: '333 666 6666 9999', note: 'Finally got 369!', photo: null,
      createdAt: now - 2 * DAY,
    },
  ];

  await Promise.all([
    setMeta(K_GROUP, group),
    setMeta(K_MEMBERS, members),
    setMeta(K_FEED, feed),
    setMeta(K_SEEDED, true),
  ]);
}

export interface SocialState {
  group: Group;
  members: GroupMember[];
  feed: FeedPost[];
  youName: string;
}

export async function loadSocial(): Promise<SocialState> {
  await seedIfNeeded();
  const [group, members, feed, youName] = await Promise.all([
    getMeta<Group>(K_GROUP, { id: 'grp_demo', name: 'Tuesday Game', inviteCode: 'MAHJ-2026' }),
    getMeta<GroupMember[]>(K_MEMBERS, []),
    getMeta<FeedPost[]>(K_FEED, []),
    getMeta<string>(K_YOU_NAME, 'You'),
  ]);
  feed.sort((a, b) => b.createdAt - a.createdAt);
  return { group, members, feed, youName };
}

export async function addFeedPost(post: FeedPost): Promise<void> {
  const feed = await getMeta<FeedPost[]>(K_FEED, []);
  feed.unshift(post);
  await setMeta(K_FEED, feed.slice(0, 200));
}

export async function setFeedHidden(id: string, hidden: boolean): Promise<void> {
  const feed = await getMeta<FeedPost[]>(K_FEED, []);
  const p = feed.find((x) => x.id === id);
  if (p) p.hidden = hidden;
  await setMeta(K_FEED, feed);
}

export async function setYouName(name: string): Promise<void> {
  await setMeta(K_YOU_NAME, name || 'You');
}
