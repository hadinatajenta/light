import type { SitePostSummary } from './public';

export const TOPIC_LIMIT = 12;
export const MIN_TOPIC_POSTS = 2;

export interface TopicContent {
  title: string;
  description: string;
  intro: string;
}

export interface TopicLink {
  slug: string;
  label: string;
  count: number;
}

const TOPIC_LABELS: Record<string, string> = {
  monitors: 'Monitors',
  keyboards: 'Keyboards',
  audio: 'Audio',
  'desk-setup': 'Desk Setup',
  chairs: 'Chairs',
  laptops: 'Laptops',
  lighting: 'Lighting',
  storage: 'Storage',
  'buying-basics': 'Buying Basics',
  accessories: 'Accessories',
  ergonomics: 'Ergonomics',
  'home-office': 'Home Office',
};

const TOPIC_CONTENT: Record<string, TopicContent> = {
  monitors: {
    title: 'Monitor guides: size, height, and viewing distance',
    description:
      'How to choose a monitor setup that fits your desk and your eyes, with the measurements that decide size, height, and distance.',
    intro:
      'Screen size, eye height, and viewing distance decide whether a monitor setup is comfortable, and all three can be measured before you buy. These guides work through the numbers and the trade-offs.',
  },
  keyboards: {
    title: 'Keyboard guides: switches, noise, and layout',
    description:
      'Pick a keyboard for the room you work in: switch feel, noise, layout, and the desk space it actually needs.',
    intro:
      'A keyboard is the tool you touch most and the one most likely to annoy the people around you. These guides cover switch feel, noise, layout, and the trade-offs between them.',
  },
  audio: {
    title: 'Desk audio guides: headsets, microphones, and speakers',
    description:
      'Calls, focus, and small rooms: how to choose a headset, a desk microphone, or speakers without buying twice.',
    intro:
      'Audio for a home desk is about the room as much as the equipment. These guides cover headsets, desk microphones, and speakers for calls, focus, and shared spaces.',
  },
  'desk-setup': {
    title: 'Desk setup guides: size, height, and cable management',
    description:
      'Build a desk setup that fits your room and your body: desk size, working height, under-desk clearance, and cable management.',
    intro:
      'A desk setup only works when the measurements do: top depth for the screen, clearance for your legs, and a route for the cables. These guides start from the measurement and end at the purchase decision.',
  },
  chairs: {
    title: 'Office chair guides: sizing, support, and ergonomics',
    description:
      'Choose an office chair by seat height, depth, and backrest support, not by marketing, with the standards worth checking.',
    intro:
      'Most office chairs run out of adjustment before they fit the person using them. These guides cover seat height, seat depth, backrest support, and the standards a buyer can check.',
  },
  'buying-basics': {
    title: 'Buying basics: how to judge a specification',
    description:
      'The questions to ask before paying: which specification matters, which is marketing, and how to compare two options fairly.',
    intro:
      'A specification sheet is only useful when you know which number decides the outcome. These guides are about judging a product before you buy it, not about a single product.',
  },
  accessories: {
    title: 'Desk accessory guides: trays, stands, and organisers',
    description:
      'Small additions that fix a real problem: keyboard trays, monitor stands, organisers, and the accessories worth the space.',
    intro:
      'Accessories are where a desk setup is either finished or cluttered. These guides cover the small additions that solve a measurable problem and the ones that do not.',
  },
  ergonomics: {
    title: 'Ergonomics guides: posture, height, and comfort',
    description:
      'Sit and stand without strain: working height, reach, posture, and the adjustments that actually change how a desk feels.',
    intro:
      'Ergonomics is arithmetic before it is furniture: heights, distances, and reach decide comfort. These guides cover posture, working height, and the adjustments worth making.',
  },
  'home-office': {
    title: 'Home office guides: small spaces that work',
    description:
      'Working from a small room or a shared space: compact desks, storage, lighting, and noise control that still function.',
    intro:
      'A home office in a small space means every choice does double duty. These guides cover compact desks, storage, lighting, and noise for rooms that are not only offices.',
  },
  laptops: {
    title: 'Laptop desk guides: stands, risers, and cooling',
    description:
      'Raise a laptop to eye height without wrecking your wrists, and keep it cool and connected at a desk.',
    intro:
      'A laptop at desk height is a compromise between the screen and your hands. These guides cover stands, risers, external keyboards, and cooling.',
  },
  lighting: {
    title: 'Desk lighting guides: task light and eye strain',
    description:
      'Match task and ambient light to the screen to cut glare and eye strain, with the measurements that matter.',
    intro:
      'Lighting decides whether a screen is comfortable to look at. These guides cover task light, ambient light, glare, and how to measure brightness rather than guess it.',
  },
  storage: {
    title: 'Desk storage guides: drawers, trays, and clearance',
    description:
      'Under-desk storage that fits: clearance, drawer travel, materials, and the pulls that survive daily use.',
    intro:
      'Storage only works when it fits the gap you have. These guides cover under-desk clearance, drawer travel, materials, and the small choices that decide whether it lasts.',
  },
  'buying-guide': {
    title: 'Buying guides: what to check before you pay',
    description:
      'Research-grounded buying guides for home-office equipment, written from primary sources and checked before publishing.',
    intro:
      'These guides answer a specific buying question with checkable detail: standards, measurements, compatibility, and the trade-offs behind each recommendation.',
  },
  'cable-management': {
    title: 'Cable management guides: trays, clips, and routing',
    description:
      'Route and hide desk cables without drilling: trays, clips, sleeves, and the clearances that decide what fits.',
    intro:
      'Cable management is a routing problem before it is a product. These guides cover trays, clips, sleeves, and the clearances that decide what fits under a desk.',
  },
  'desk-accessories': {
    title: 'Desk accessories: the small things that matter',
    description:
      'The accessories that earn their space on a small desk, and the ones that only add clutter.',
    intro:
      'On a small desk, every accessory costs space. These guides cover the additions that solve a real problem and the ones that only look tidy.',
  },
};

export function topicLabel(slug: string): string {
  const known = TOPIC_LABELS[slug];
  if (known) {
    return known;
  }

  return slug
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function topicContent(slug: string): TopicContent {
  const known = TOPIC_CONTENT[slug];
  if (known) {
    return known;
  }

  const label = topicLabel(slug);

  return {
    title: `${label} guides from Light Scripts`,
    description: `Independent buying guides about ${label.toLowerCase()}: what to check, what to avoid, and the measurements that decide it.`,
    intro: `Every guide filed under ${label.toLowerCase()}, written from primary sources and reviewed before publishing.`,
  };
}

export function listTopicPosts(posts: SitePostSummary[], slug: string): SitePostSummary[] {
  return posts.filter((post) => post.tags.includes(slug) || post.category === slug);
}

function rankTopics(counts: Map<string, number>): TopicLink[] {
  return [...counts.entries()]
    .filter(([, count]) => count >= MIN_TOPIC_POSTS)
    .map(([slug, count]) => ({ slug, label: topicLabel(slug), count }))
    .sort((first, second) => second.count - first.count || first.label.localeCompare(second.label))
    .slice(0, TOPIC_LIMIT);
}

export function buildTopics(posts: SitePostSummary[]): TopicLink[] {
  const counts = new Map<string, number>();

  for (const post of posts) {
    const slugs = post.category ? [...post.tags, post.category] : post.tags;

    for (const slug of slugs) {
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
  }

  return rankTopics(counts);
}

export async function loadTopics(db: D1Database): Promise<TopicLink[]> {
  const result = await db
    .prepare("SELECT category, tags FROM posts WHERE status = 'published'")
    .all<{ category: string | null; tags: string }>();
  const counts = new Map<string, number>();

  for (const row of result.results ?? []) {
    const slugs = [...readRowTags(row.tags), ...(row.category ? [row.category] : [])];

    for (const slug of slugs) {
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
  }

  return rankTopics(counts);
}

function readRowTags(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === 'string')
      : [];
  } catch {
    return [];
  }
}
