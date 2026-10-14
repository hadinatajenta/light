import { getSetting, setSetting } from '../../settings/store';
import { readLimit, readRate } from '../budget';

export const ANALYST_NO_LINK_MIN_VIEWS_SHARE_SETTING = 'analyst_no_link_min_views_share';
export const ANALYST_NO_LINK_MIN_VIEWS_FLOOR_SETTING = 'analyst_no_link_min_views_floor';
export const ANALYST_BROKEN_PLACEMENT_MIN_CLICKS_SETTING = 'analyst_broken_placement_min_clicks';
export const ANALYST_REDIRECT_MISS_MIN_COUNT_SETTING = 'analyst_redirect_miss_min_count';
export const ANALYST_ZERO_VIEWS_MIN_AGE_DAYS_SETTING = 'analyst_zero_views_min_age_days';
export const ANALYST_ZERO_VIEWS_MAX_FINDINGS_SETTING = 'analyst_zero_views_max_findings';
export const ANALYST_GSC_MIN_IMPRESSIONS_SETTING = 'analyst_gsc_min_impressions';
export const ANALYST_GSC_MIN_PAGE_AGE_DAYS_SETTING = 'analyst_gsc_min_page_age_days';
export const ANALYST_TITLE_META_MAX_POSITION_SETTING = 'analyst_title_meta_max_position';
export const ANALYST_TITLE_META_MAX_CTR_SETTING = 'analyst_title_meta_max_ctr';
export const ANALYST_REFRESH_MIN_POSITION_SETTING = 'analyst_refresh_min_position';
export const ANALYST_REFRESH_MIN_AGE_DAYS_SETTING = 'analyst_refresh_min_age_days';
export const ANALYST_NEW_TOPIC_MIN_IMPRESSIONS_SETTING = 'analyst_new_topic_min_impressions';
export const ANALYST_PRODUCT_CHECK_MIN_CLICKS_SETTING = 'analyst_product_check_min_clicks';

export const DEFAULT_ANALYST_NO_LINK_MIN_VIEWS_SHARE = 0.02;
export const DEFAULT_ANALYST_NO_LINK_MIN_VIEWS_FLOOR = 3;
export const DEFAULT_ANALYST_BROKEN_PLACEMENT_MIN_CLICKS = 1;
export const DEFAULT_ANALYST_REDIRECT_MISS_MIN_COUNT = 2;
export const DEFAULT_ANALYST_ZERO_VIEWS_MIN_AGE_DAYS = 30;
export const DEFAULT_ANALYST_ZERO_VIEWS_MAX_FINDINGS = 1;
export const DEFAULT_ANALYST_GSC_MIN_IMPRESSIONS = 20;
export const DEFAULT_ANALYST_GSC_MIN_PAGE_AGE_DAYS = 30;
export const DEFAULT_ANALYST_TITLE_META_MAX_POSITION = 10;
export const DEFAULT_ANALYST_TITLE_META_MAX_CTR = 0.02;
export const DEFAULT_ANALYST_REFRESH_MIN_POSITION = 10;
export const DEFAULT_ANALYST_REFRESH_MIN_AGE_DAYS = 60;
export const DEFAULT_ANALYST_NEW_TOPIC_MIN_IMPRESSIONS = 10;
export const DEFAULT_ANALYST_PRODUCT_CHECK_MIN_CLICKS = 3;

export interface AnalystConfig {
  noLinkMinViewsShare: number;
  noLinkMinViewsFloor: number;
  brokenPlacementMinClicks: number;
  redirectMissMinCount: number;
  zeroViewsMinAgeDays: number;
  zeroViewsMaxFindings: number;
  gscMinImpressions: number;
  gscMinPageAgeDays: number;
  titleMetaMaxPosition: number;
  titleMetaMaxCtr: number;
  refreshMinPosition: number;
  refreshMinAgeDays: number;
  newTopicMinImpressions: number;
  productCheckMinClicks: number;
}

export function resolveNoLinkMinViews(
  config: Pick<AnalystConfig, 'noLinkMinViewsShare' | 'noLinkMinViewsFloor'>,
  totalViews: number,
): number {
  const shareFloor = Math.ceil(Math.max(totalViews, 0) * Math.max(config.noLinkMinViewsShare, 0));

  return Math.max(config.noLinkMinViewsFloor, shareFloor);
}

export async function readAnalystConfig(db: D1Database): Promise<AnalystConfig> {
  const [
    noLinkShare,
    noLinkFloor,
    brokenPlacementClicks,
    redirectMissCount,
    zeroViewsAgeDays,
    zeroViewsMaxFindings,
    gscMinImpressions,
    gscMinPageAgeDays,
    titleMetaMaxPosition,
    titleMetaMaxCtr,
    refreshMinPosition,
    refreshMinAgeDays,
    newTopicMinImpressions,
    productCheckMinClicks,
  ] = await Promise.all([
    getSetting(db, ANALYST_NO_LINK_MIN_VIEWS_SHARE_SETTING),
    getSetting(db, ANALYST_NO_LINK_MIN_VIEWS_FLOOR_SETTING),
    getSetting(db, ANALYST_BROKEN_PLACEMENT_MIN_CLICKS_SETTING),
    getSetting(db, ANALYST_REDIRECT_MISS_MIN_COUNT_SETTING),
    getSetting(db, ANALYST_ZERO_VIEWS_MIN_AGE_DAYS_SETTING),
    getSetting(db, ANALYST_ZERO_VIEWS_MAX_FINDINGS_SETTING),
    getSetting(db, ANALYST_GSC_MIN_IMPRESSIONS_SETTING),
    getSetting(db, ANALYST_GSC_MIN_PAGE_AGE_DAYS_SETTING),
    getSetting(db, ANALYST_TITLE_META_MAX_POSITION_SETTING),
    getSetting(db, ANALYST_TITLE_META_MAX_CTR_SETTING),
    getSetting(db, ANALYST_REFRESH_MIN_POSITION_SETTING),
    getSetting(db, ANALYST_REFRESH_MIN_AGE_DAYS_SETTING),
    getSetting(db, ANALYST_NEW_TOPIC_MIN_IMPRESSIONS_SETTING),
    getSetting(db, ANALYST_PRODUCT_CHECK_MIN_CLICKS_SETTING),
  ]);

  return {
    noLinkMinViewsShare: readRate(noLinkShare, DEFAULT_ANALYST_NO_LINK_MIN_VIEWS_SHARE),
    noLinkMinViewsFloor: readLimit(noLinkFloor, DEFAULT_ANALYST_NO_LINK_MIN_VIEWS_FLOOR),
    brokenPlacementMinClicks: readLimit(
      brokenPlacementClicks,
      DEFAULT_ANALYST_BROKEN_PLACEMENT_MIN_CLICKS,
    ),
    redirectMissMinCount: readLimit(redirectMissCount, DEFAULT_ANALYST_REDIRECT_MISS_MIN_COUNT),
    zeroViewsMinAgeDays: readLimit(zeroViewsAgeDays, DEFAULT_ANALYST_ZERO_VIEWS_MIN_AGE_DAYS),
    zeroViewsMaxFindings: readLimit(zeroViewsMaxFindings, DEFAULT_ANALYST_ZERO_VIEWS_MAX_FINDINGS),
    gscMinImpressions: readLimit(gscMinImpressions, DEFAULT_ANALYST_GSC_MIN_IMPRESSIONS),
    gscMinPageAgeDays: readLimit(gscMinPageAgeDays, DEFAULT_ANALYST_GSC_MIN_PAGE_AGE_DAYS),
    titleMetaMaxPosition: readRate(titleMetaMaxPosition, DEFAULT_ANALYST_TITLE_META_MAX_POSITION),
    titleMetaMaxCtr: readRate(titleMetaMaxCtr, DEFAULT_ANALYST_TITLE_META_MAX_CTR),
    refreshMinPosition: readRate(refreshMinPosition, DEFAULT_ANALYST_REFRESH_MIN_POSITION),
    refreshMinAgeDays: readLimit(refreshMinAgeDays, DEFAULT_ANALYST_REFRESH_MIN_AGE_DAYS),
    newTopicMinImpressions: readLimit(
      newTopicMinImpressions,
      DEFAULT_ANALYST_NEW_TOPIC_MIN_IMPRESSIONS,
    ),
    productCheckMinClicks: readLimit(
      productCheckMinClicks,
      DEFAULT_ANALYST_PRODUCT_CHECK_MIN_CLICKS,
    ),
  };
}

export async function saveAnalystConfig(
  db: D1Database,
  config: Partial<AnalystConfig>,
): Promise<void> {
  if (typeof config.noLinkMinViewsShare === 'number') {
    await setSetting(
      db,
      ANALYST_NO_LINK_MIN_VIEWS_SHARE_SETTING,
      String(config.noLinkMinViewsShare),
    );
  }
  if (typeof config.noLinkMinViewsFloor === 'number') {
    await setSetting(
      db,
      ANALYST_NO_LINK_MIN_VIEWS_FLOOR_SETTING,
      String(config.noLinkMinViewsFloor),
    );
  }
  if (typeof config.brokenPlacementMinClicks === 'number') {
    await setSetting(
      db,
      ANALYST_BROKEN_PLACEMENT_MIN_CLICKS_SETTING,
      String(config.brokenPlacementMinClicks),
    );
  }
  if (typeof config.redirectMissMinCount === 'number') {
    await setSetting(
      db,
      ANALYST_REDIRECT_MISS_MIN_COUNT_SETTING,
      String(config.redirectMissMinCount),
    );
  }
  if (typeof config.zeroViewsMinAgeDays === 'number') {
    await setSetting(
      db,
      ANALYST_ZERO_VIEWS_MIN_AGE_DAYS_SETTING,
      String(config.zeroViewsMinAgeDays),
    );
  }
  if (typeof config.zeroViewsMaxFindings === 'number') {
    await setSetting(
      db,
      ANALYST_ZERO_VIEWS_MAX_FINDINGS_SETTING,
      String(config.zeroViewsMaxFindings),
    );
  }
  if (typeof config.gscMinImpressions === 'number') {
    await setSetting(db, ANALYST_GSC_MIN_IMPRESSIONS_SETTING, String(config.gscMinImpressions));
  }
  if (typeof config.gscMinPageAgeDays === 'number') {
    await setSetting(db, ANALYST_GSC_MIN_PAGE_AGE_DAYS_SETTING, String(config.gscMinPageAgeDays));
  }
  if (typeof config.titleMetaMaxPosition === 'number') {
    await setSetting(
      db,
      ANALYST_TITLE_META_MAX_POSITION_SETTING,
      String(config.titleMetaMaxPosition),
    );
  }
  if (typeof config.titleMetaMaxCtr === 'number') {
    await setSetting(db, ANALYST_TITLE_META_MAX_CTR_SETTING, String(config.titleMetaMaxCtr));
  }
  if (typeof config.refreshMinPosition === 'number') {
    await setSetting(db, ANALYST_REFRESH_MIN_POSITION_SETTING, String(config.refreshMinPosition));
  }
  if (typeof config.refreshMinAgeDays === 'number') {
    await setSetting(db, ANALYST_REFRESH_MIN_AGE_DAYS_SETTING, String(config.refreshMinAgeDays));
  }
  if (typeof config.newTopicMinImpressions === 'number') {
    await setSetting(
      db,
      ANALYST_NEW_TOPIC_MIN_IMPRESSIONS_SETTING,
      String(config.newTopicMinImpressions),
    );
  }
  if (typeof config.productCheckMinClicks === 'number') {
    await setSetting(
      db,
      ANALYST_PRODUCT_CHECK_MIN_CLICKS_SETTING,
      String(config.productCheckMinClicks),
    );
  }
}
