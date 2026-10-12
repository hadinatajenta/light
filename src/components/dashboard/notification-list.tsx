import {
  CheckIcon,
  InboxIcon,
  Loader2Icon,
  RefreshCwIcon,
  SearchXIcon,
  Trash2Icon,
  UndoIcon,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_LEVELS,
  type NotificationCategory,
  type NotificationLevel,
  type NotificationRecord,
} from '@/lib/notifications/types';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/utils/date';
import { requestJson, toErrorMessage } from './api-client';
import {
  NOTIFICATION_CATEGORY_LABELS,
  NOTIFICATION_EVENT_LABELS,
  NOTIFICATION_LEVEL_LABELS,
  notificationLevelDotClass,
  shouldUpdateNotificationReadState,
} from './notification-presentation';

const NOTIFICATIONS_ENDPOINT = '/api/dashboard/notifications';
const PAGE_SIZE = 20;
const SKELETON_ROWS = ['notification-row-1', 'notification-row-2', 'notification-row-3'];

interface NotificationListResponse {
  notifications: NotificationRecord[];
  unreadCount: number;
  hasMore: boolean;
  nextCursor: string | null;
}

interface ReadResponse {
  id: string;
  read: boolean;
  unreadCount: number;
}

function buildQuery(
  level: NotificationLevel | '',
  category: NotificationCategory | '',
  cursor: string | null,
): string {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (level) {
    params.set('level', level);
  }
  if (category) {
    params.set('category', category);
  }
  if (cursor) {
    params.set('cursor', cursor);
  }

  return params.toString();
}

export default function NotificationList() {
  const [entries, setEntries] = useState<NotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [level, setLevel] = useState<NotificationLevel | ''>('');
  const [category, setCategory] = useState<NotificationCategory | ''>('');
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const hasActiveFilters = level !== '' || category !== '';

  const loadPage = useCallback(
    async (options: { append: boolean; cursor: string | null }) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      if (options.append) {
        setIsLoadingMore(true);
      } else {
        setStatus('loading');
      }

      try {
        const payload = await requestJson<NotificationListResponse>(
          `${NOTIFICATIONS_ENDPOINT}?${buildQuery(level, category, options.cursor)}`,
          { signal: controller.signal },
        );
        if (controller.signal.aborted) {
          return;
        }

        setEntries((current) =>
          options.append ? [...current, ...payload.notifications] : payload.notifications,
        );
        setUnreadCount(payload.unreadCount);
        setHasMore(payload.hasMore);
        setNextCursor(payload.nextCursor);
        setLoadError(null);
        setStatus('ready');
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        setLoadError(toErrorMessage(error));
        setStatus('error');
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingMore(false);
        }
      }
    },
    [category, level],
  );

  useEffect(() => {
    void loadPage({ append: false, cursor: null });
    return () => controllerRef.current?.abort();
  }, [loadPage]);

  const applyReadState = useCallback(
    async (entry: NotificationRecord, shouldBeRead: boolean, keepalive = false) => {
      if (!shouldUpdateNotificationReadState(entry.readAt, shouldBeRead)) {
        return;
      }

      const previousReadAt = entry.readAt;
      const optimisticReadAt = shouldBeRead ? new Date().toISOString() : null;

      setEntries((current) =>
        current.map((row) => (row.id === entry.id ? { ...row, readAt: optimisticReadAt } : row)),
      );
      setUnreadCount((current) => Math.max(0, current + (shouldBeRead ? -1 : 1)));

      try {
        const payload = await requestJson<ReadResponse>(`${NOTIFICATIONS_ENDPOINT}/${entry.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ read: shouldBeRead }),
          keepalive,
        });
        setUnreadCount(payload.unreadCount);
      } catch (error) {
        setEntries((current) =>
          current.map((row) => (row.id === entry.id ? { ...row, readAt: previousReadAt } : row)),
        );
        setUnreadCount((current) => Math.max(0, current + (shouldBeRead ? 1 : -1)));
        toast.error(toErrorMessage(error));
      }
    },
    [],
  );

  const handleToggleRead = async (entry: NotificationRecord) => {
    if (pendingId !== null) {
      return;
    }

    setPendingId(entry.id);

    try {
      await applyReadState(entry, entry.readAt === null);
    } finally {
      setPendingId(null);
    }
  };

  const handleClearRead = async () => {
    if (isClearing) {
      return;
    }

    setIsClearing(true);

    try {
      const payload = await requestJson<{ deleted: number }>(
        `${NOTIFICATIONS_ENDPOINT}?scope=read`,
        { method: 'DELETE' },
      );
      toast.success(
        payload.deleted === 1
          ? 'Deleted 1 read notification.'
          : `Deleted ${payload.deleted} read notifications.`,
      );
      await loadPage({ append: false, cursor: null });
    } catch (error) {
      toast.error(toErrorMessage(error));
    } finally {
      setIsClearing(false);
    }
  };

  const filters = (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notification-level">Level</Label>
        <Select
          id="notification-level"
          value={level}
          onChange={(event) => setLevel(event.target.value as NotificationLevel | '')}
        >
          <option value="">All levels</option>
          {NOTIFICATION_LEVELS.map((value) => (
            <option key={value} value={value}>
              {NOTIFICATION_LEVEL_LABELS[value]}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notification-category">Category</Label>
        <Select
          id="notification-category"
          value={category}
          onChange={(event) => setCategory(event.target.value as NotificationCategory | '')}
        >
          <option value="">All categories</option>
          {NOTIFICATION_CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {NOTIFICATION_CATEGORY_LABELS[value]}
            </option>
          ))}
        </Select>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="whitespace-nowrap"
        disabled={isClearing}
        onClick={() => void handleClearRead()}
      >
        <Trash2Icon aria-hidden="true" />
        {isClearing ? 'Clearing' : 'Clear read'}
      </Button>
    </div>
  );

  return (
    <section
      aria-label="Notifications"
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-foreground">All notifications</h3>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Every recorded system event, newest first. Configure delivery under Settings.
          </p>
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          {unreadCount === 1 ? '1 unread' : `${unreadCount} unread`}
        </p>
      </div>

      {filters}

      {status === 'loading' ? (
        <ul className="flex flex-col" aria-busy="true">
          {SKELETON_ROWS.map((key) => (
            <li
              key={key}
              className="flex items-start gap-3 border-b border-border py-3 last:border-b-0"
            >
              <Skeleton className="mt-1.5 size-2 rounded-full" />
              <span className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-32" />
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {status === 'error' ? (
        <div className="flex flex-col items-start gap-3">
          <p className="max-w-prose text-sm text-muted-foreground">{loadError}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="whitespace-nowrap"
            onClick={() => void loadPage({ append: false, cursor: null })}
          >
            <RefreshCwIcon aria-hidden="true" />
            Retry
          </Button>
        </div>
      ) : null}

      {status === 'ready' && entries.length === 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border p-6">
          {hasActiveFilters ? (
            <>
              <SearchXIcon className="size-5 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">No notifications match these filters.</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="whitespace-nowrap"
                onClick={() => {
                  setLevel('');
                  setCategory('');
                }}
              >
                Clear filters
              </Button>
            </>
          ) : (
            <>
              <InboxIcon className="size-5 text-muted-foreground" aria-hidden="true" />
              <p className="max-w-prose text-sm text-muted-foreground">
                Nothing yet. Agent runs, publishes, failures, and budget warnings will appear here
                as they happen.
              </p>
            </>
          )}
        </div>
      ) : null}

      {entries.length > 0 ? (
        <ul className="flex flex-col">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className={cn(
                'flex flex-col gap-2 border-b border-border py-3 last:border-b-0',
                entry.readAt === null ? '' : 'opacity-70',
              )}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span
                  className={cn(
                    'size-2 shrink-0 rounded-full',
                    notificationLevelDotClass(entry.level),
                  )}
                  aria-hidden="true"
                />
                <span
                  className={cn(
                    'min-w-0 flex-1 text-sm',
                    entry.readAt === null ? 'font-medium text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {entry.title}
                </span>
                <time
                  className="text-xs text-muted-foreground tabular-nums"
                  dateTime={entry.createdAt}
                >
                  {formatRelativeTime(entry.createdAt)}
                </time>
              </div>

              {entry.body ? (
                <p className="max-w-prose text-sm whitespace-pre-line text-muted-foreground">
                  {entry.body}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-[0.6875rem] text-muted-foreground">
                  {NOTIFICATION_LEVEL_LABELS[entry.level]}
                </Badge>
                <Badge variant="outline" className="text-[0.6875rem] text-muted-foreground">
                  {NOTIFICATION_CATEGORY_LABELS[entry.category]}
                </Badge>
                <span className="text-[0.6875rem] text-muted-foreground">
                  {NOTIFICATION_EVENT_LABELS[entry.event]}
                </span>
                {entry.pushStatus === 'failed' ? (
                  <Badge variant="outline" className="text-[0.6875rem] text-destructive">
                    Delivery failed
                  </Badge>
                ) : null}

                <span className="ml-auto flex flex-wrap items-center gap-2">
                  {entry.link ? (
                    <a
                      href={entry.link}
                      onClick={() => void applyReadState(entry, true, true)}
                      className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                      Open
                    </a>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 whitespace-nowrap px-2 text-xs"
                    disabled={pendingId === entry.id}
                    onClick={() => void handleToggleRead(entry)}
                  >
                    {pendingId === entry.id ? (
                      <Loader2Icon className="animate-spin" aria-hidden="true" />
                    ) : entry.readAt === null ? (
                      <CheckIcon aria-hidden="true" />
                    ) : (
                      <UndoIcon aria-hidden="true" />
                    )}
                    {entry.readAt === null ? 'Mark read' : 'Mark unread'}
                  </Button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {hasMore ? (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="whitespace-nowrap"
            disabled={isLoadingMore}
            onClick={() => void loadPage({ append: true, cursor: nextCursor })}
          >
            {isLoadingMore ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : null}
            {isLoadingMore ? 'Loading' : 'Load more'}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
