import { describe, expect, it } from 'vitest';
import {
  addViewDays,
  buildTopViewedPosts,
  buildViewTotals,
  changePercent,
  isBotUserAgent,
  isPrefetchRequest,
  normalizeViewPath,
  postIdFromViewPath,
  selectOpportunities,
  shouldRecordView,
  sumViewCounts,
  toClickRate,
  VIEW_DAY_TIME_ZONE,
  viewDayKey,
  viewDaySeries,
} from './views';

describe('viewDayKey', () => {
  it('uses the operator time zone, not UTC', () => {
    expect(VIEW_DAY_TIME_ZONE).toBe('Asia/Jakarta');
    expect(viewDayKey(new Date('2026-10-11T18:00:00.000Z'))).toBe('2026-10-12');
    expect(viewDayKey(new Date('2026-10-11T16:59:00.000Z'))).toBe('2026-10-11');
  });
});

describe('addViewDays', () => {
  it('walks backwards across a month boundary', () => {
    expect(addViewDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('walks forwards across a year boundary', () => {
    expect(addViewDays('2025-12-31', 1)).toBe('2026-01-01');
  });
});

describe('viewDaySeries', () => {
  it('returns the requested window ending today, oldest first', () => {
    const series = viewDaySeries(3, '2026-10-12');

    expect(series.map((entry) => entry.day)).toEqual(['2026-10-10', '2026-10-11', '2026-10-12']);
  });
});

describe('normalizeViewPath', () => {
  it('drops a trailing slash so one page is one key', () => {
    expect(normalizeViewPath('/blog/a-guide/')).toBe('/blog/a-guide');
    expect(normalizeViewPath('/blog/a-guide')).toBe('/blog/a-guide');
  });

  it('keeps the root path', () => {
    expect(normalizeViewPath('/')).toBe('/');
    expect(normalizeViewPath('')).toBe('/');
  });

  it('drops a query string and a fragment', () => {
    expect(normalizeViewPath('/blog/a-guide?utm_source=x#top')).toBe('/blog/a-guide');
  });
});

describe('postIdFromViewPath', () => {
  it('reads the slug from an article path', () => {
    expect(postIdFromViewPath('/blog/best-monitor-arm')).toBe('best-monitor-arm');
  });

  it('returns nothing for a non-article path', () => {
    expect(postIdFromViewPath('/')).toBeNull();
    expect(postIdFromViewPath('/tag/monitors')).toBeNull();
    expect(postIdFromViewPath('/blog/a/b')).toBeNull();
  });
});

describe('isBotUserAgent', () => {
  it('treats a missing agent as a bot', () => {
    expect(isBotUserAgent(null)).toBe(true);
  });

  it('recognizes search and preview crawlers', () => {
    expect(isBotUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1)')).toBe(true);
    expect(isBotUserAgent('Mozilla/5.0 (compatible; bingbot/2.0)')).toBe(true);
    expect(isBotUserAgent('facebookexternalhit/1.1')).toBe(true);
    expect(isBotUserAgent('Slackbot-LinkExpanding 1.0')).toBe(true);
    expect(isBotUserAgent('curl/8.4.0')).toBe(true);
  });

  it('accepts a real browser', () => {
    expect(
      isBotUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36',
      ),
    ).toBe(false);
  });
});

describe('isPrefetchRequest', () => {
  it('spots a prefetch', () => {
    expect(isPrefetchRequest(new Headers({ purpose: 'prefetch' }))).toBe(true);
    expect(isPrefetchRequest(new Headers({ 'sec-purpose': 'prefetch;prerender' }))).toBe(true);
  });

  it('leaves a normal navigation alone', () => {
    expect(isPrefetchRequest(new Headers({ purpose: 'document' }))).toBe(false);
    expect(isPrefetchRequest(new Headers())).toBe(false);
  });
});

describe('shouldRecordView', () => {
  const browserAgent =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/141.0 Safari/537.36';

  it('counts a browser navigation', () => {
    const request = new Request('https://lightscripts.com/blog/a-guide', {
      headers: { 'user-agent': browserAgent },
    });

    expect(shouldRecordView(request)).toBe(true);
  });

  it('ignores a crawler', () => {
    const request = new Request('https://lightscripts.com/blog/a-guide', {
      headers: { 'user-agent': 'Googlebot/2.1' },
    });

    expect(shouldRecordView(request)).toBe(false);
  });

  it('ignores a prefetch', () => {
    const request = new Request('https://lightscripts.com/blog/a-guide', {
      headers: { 'user-agent': browserAgent, purpose: 'prefetch' },
    });

    expect(shouldRecordView(request)).toBe(false);
  });

  it('ignores anything that is not a GET', () => {
    const request = new Request('https://lightscripts.com/blog/a-guide', {
      method: 'POST',
      headers: { 'user-agent': browserAgent },
    });

    expect(shouldRecordView(request)).toBe(false);
  });
});

describe('sumViewCounts', () => {
  const rows = [
    { day: '2026-10-01', total: 5 },
    { day: '2026-10-02', total: 7 },
    { day: '2026-10-03', total: 11 },
  ];

  it('adds only the days inside the window', () => {
    expect(sumViewCounts(rows, '2026-10-02', '2026-10-03')).toBe(18);
  });

  it('is zero for a window with no data', () => {
    expect(sumViewCounts(rows, '2026-09-01', '2026-09-30')).toBe(0);
  });
});

describe('changePercent', () => {
  it('reports growth', () => {
    expect(changePercent(150, 100)).toBe(50);
  });

  it('reports a fall', () => {
    expect(changePercent(50, 100)).toBe(-50);
  });

  it('reports zero when nothing changed', () => {
    expect(changePercent(0, 0)).toBe(0);
  });

  it('refuses a percentage from a zero base', () => {
    expect(changePercent(40, 0)).toBeNull();
  });
});

describe('buildViewTotals', () => {
  it('carries both periods and the change', () => {
    expect(buildViewTotals(120, 100)).toEqual({
      views: 120,
      previousViews: 100,
      changePercent: 20,
    });
  });
});

describe('toClickRate', () => {
  it('reports clicks as a share of views', () => {
    expect(toClickRate(400, 12)).toBe(3);
  });

  it('refuses a rate without views', () => {
    expect(toClickRate(0, 0)).toBeNull();
  });
});

describe('selectOpportunities', () => {
  const posts = buildTopViewedPosts([
    { post_id: 'a', title: 'A', category: 'monitors', views: 900, clicks: 0 },
    { post_id: 'b', title: 'B', category: 'monitors', views: 100, clicks: 9 },
    { post_id: 'c', title: 'C', category: 'audio', views: 400, clicks: 0 },
    { post_id: 'd', title: 'D', category: 'audio', views: 50, clicks: 0 },
    { post_id: 'e', title: 'E', category: 'chairs', views: 800, clicks: 4 },
  ]);

  it('lists read but unmonetised posts by traffic', () => {
    expect(selectOpportunities(posts).noClicks.map((post) => post.postId)).toEqual(['a', 'c', 'd']);
  });

  it('lists the best converting posts', () => {
    expect(selectOpportunities(posts).bestClickRate.map((post) => post.postId)).toEqual(['b', 'e']);
  });
});
