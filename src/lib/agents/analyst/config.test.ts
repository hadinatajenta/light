import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ANALYST_BROKEN_PLACEMENT_MIN_CLICKS,
  DEFAULT_ANALYST_GSC_MIN_IMPRESSIONS,
  DEFAULT_ANALYST_GSC_MIN_PAGE_AGE_DAYS,
  DEFAULT_ANALYST_NEW_TOPIC_MIN_IMPRESSIONS,
  DEFAULT_ANALYST_NO_LINK_MIN_VIEWS_FLOOR,
  DEFAULT_ANALYST_NO_LINK_MIN_VIEWS_SHARE,
  DEFAULT_ANALYST_PRODUCT_CHECK_MIN_CLICKS,
  DEFAULT_ANALYST_REDIRECT_MISS_MIN_COUNT,
  DEFAULT_ANALYST_REFRESH_MIN_AGE_DAYS,
  DEFAULT_ANALYST_REFRESH_MIN_POSITION,
  DEFAULT_ANALYST_TITLE_META_MAX_CTR,
  DEFAULT_ANALYST_TITLE_META_MAX_POSITION,
  DEFAULT_ANALYST_ZERO_VIEWS_MAX_FINDINGS,
  DEFAULT_ANALYST_ZERO_VIEWS_MIN_AGE_DAYS,
  resolveNoLinkMinViews,
} from './config';

const CONFIG = {
  noLinkMinViewsShare: DEFAULT_ANALYST_NO_LINK_MIN_VIEWS_SHARE,
  noLinkMinViewsFloor: DEFAULT_ANALYST_NO_LINK_MIN_VIEWS_FLOOR,
};

describe('resolveNoLinkMinViews', () => {
  it('uses the absolute floor when the share of traffic is smaller', () => {
    expect(resolveNoLinkMinViews(CONFIG, 10)).toBe(3);
    expect(resolveNoLinkMinViews(CONFIG, 0)).toBe(3);
  });

  it('rounds the share of total views up', () => {
    expect(resolveNoLinkMinViews(CONFIG, 168)).toBe(4);
    expect(resolveNoLinkMinViews(CONFIG, 150)).toBe(3);
    expect(resolveNoLinkMinViews(CONFIG, 200)).toBe(4);
  });

  it('scales with the site as traffic grows', () => {
    expect(resolveNoLinkMinViews(CONFIG, 1_000)).toBe(20);
    expect(resolveNoLinkMinViews(CONFIG, 10_000)).toBe(200);
  });

  it('never returns a negative floor', () => {
    expect(resolveNoLinkMinViews({ noLinkMinViewsShare: -1, noLinkMinViewsFloor: 2 }, -100)).toBe(
      2,
    );
  });
});

describe('analyst threshold defaults', () => {
  it('stays at a scale the current site can satisfy', () => {
    expect(DEFAULT_ANALYST_NO_LINK_MIN_VIEWS_FLOOR).toBe(3);
    expect(DEFAULT_ANALYST_NO_LINK_MIN_VIEWS_SHARE).toBe(0.02);
    expect(DEFAULT_ANALYST_BROKEN_PLACEMENT_MIN_CLICKS).toBe(1);
    expect(DEFAULT_ANALYST_REDIRECT_MISS_MIN_COUNT).toBe(2);
    expect(DEFAULT_ANALYST_ZERO_VIEWS_MIN_AGE_DAYS).toBe(30);
    expect(DEFAULT_ANALYST_ZERO_VIEWS_MAX_FINDINGS).toBe(1);
  });

  it('gates the credential backed rules on impressions, age, and coverage', () => {
    expect(DEFAULT_ANALYST_GSC_MIN_IMPRESSIONS).toBe(20);
    expect(DEFAULT_ANALYST_GSC_MIN_PAGE_AGE_DAYS).toBe(30);
    expect(DEFAULT_ANALYST_TITLE_META_MAX_POSITION).toBe(10);
    expect(DEFAULT_ANALYST_TITLE_META_MAX_CTR).toBe(0.02);
    expect(DEFAULT_ANALYST_REFRESH_MIN_POSITION).toBe(10);
    expect(DEFAULT_ANALYST_REFRESH_MIN_AGE_DAYS).toBe(60);
    expect(DEFAULT_ANALYST_NEW_TOPIC_MIN_IMPRESSIONS).toBe(10);
    expect(DEFAULT_ANALYST_PRODUCT_CHECK_MIN_CLICKS).toBe(3);
  });
});
