import { BellIcon, CheckCheckIcon, RefreshCwIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { NotificationRecord } from '@/lib/notifications/types';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/utils/date';
import { requestJson, toErrorMessage } from './api-client';
import {
  notificationLevelDotClass,
  shouldUpdateNotificationReadState,
} from './notification-presentation';

const NOTIFICATIONS_ENDPOINT = '/api/dashboard/notifications';
const POLL_MS = 20_000;
const PREVIEW_LIMIT = 8;
const BADGE_MAX = 9;
const SKELETON_ROWS = ['notification-bell-1', 'notification-bell-2', 'notification-bell-3'];

interface NotificationFeed {
  notifications: NotificationRecord[];
  unreadCount: number;
}

interface MarkAllReadResponse {
  updated: number;
  unreadCount: number;
}

interface MarkReadResponse {
  id: string;
  read: boolean;
  unreadCount: number;
}

export default function NotificationBell() {
  const [feed, setFeed] = useState<NotificationFeed | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isMarking, setIsMarking] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const summaryRef = useRef<HTMLElement | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const loadFeed = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const payload = await requestJson<NotificationFeed>(
        `${NOTIFICATIONS_ENDPOINT}?limit=${PREVIEW_LIMIT}`,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) {
        return;
      }
      setFeed(payload);
      setLoadError(null);
      setStatus('ready');
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      setLoadError(toErrorMessage(error));
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void loadFeed();
    const interval = window.setInterval(() => void loadFeed(), POLL_MS);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void loadFeed();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      controllerRef.current?.abort();
    };
  }, [loadFeed]);

  const closePanel = useCallback(() => {
    if (detailsRef.current) {
      detailsRef.current.open = false;
    }
    setIsOpen(false);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!detailsRef.current?.contains(event.target as Node)) {
        closePanel();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closePanel();
        summaryRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closePanel, isOpen]);

  const markEntryRead = useCallback(async (entry: NotificationRecord) => {
    if (!shouldUpdateNotificationReadState(entry.readAt, true)) {
      return;
    }

    const readAt = new Date().toISOString();
    setFeed((current) =>
      current
        ? {
            notifications: current.notifications.map((row) =>
              row.id === entry.id ? { ...row, readAt } : row,
            ),
            unreadCount: Math.max(0, current.unreadCount - 1),
          }
        : current,
    );

    try {
      const payload = await requestJson<MarkReadResponse>(`${NOTIFICATIONS_ENDPOINT}/${entry.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ read: true }),
        keepalive: true,
      });
      setFeed((current) => (current ? { ...current, unreadCount: payload.unreadCount } : current));
    } catch {
      setFeed((current) =>
        current
          ? {
              notifications: current.notifications.map((row) =>
                row.id === entry.id ? { ...row, readAt: null } : row,
              ),
              unreadCount: current.unreadCount + 1,
            }
          : current,
      );
    }
  }, []);

  const handleMarkAllRead = async () => {
    if (isMarking) {
      return;
    }

    setIsMarking(true);

    try {
      const payload = await requestJson<MarkAllReadResponse>(NOTIFICATIONS_ENDPOINT, {
        method: 'PATCH',
        body: JSON.stringify({ read: true }),
      });
      const readAt = new Date().toISOString();
      setFeed((current) =>
        current
          ? {
              notifications: current.notifications.map((entry) => ({
                ...entry,
                readAt: entry.readAt ?? readAt,
              })),
              unreadCount: payload.unreadCount,
            }
          : current,
      );
      toast.success(
        payload.updated === 1
          ? 'Marked 1 notification as read.'
          : `Marked ${payload.updated} notifications as read.`,
      );
    } catch (error) {
      toast.error(toErrorMessage(error));
    } finally {
      setIsMarking(false);
    }
  };

  const unreadCount = feed?.unreadCount ?? 0;

  return (
    <details
      ref={detailsRef}
      className="relative"
      onToggle={() => {
        const isNowOpen = detailsRef.current?.open ?? false;
        setIsOpen(isNowOpen);
        if (isNowOpen) {
          void loadFeed();
        }
      }}
    >
      <summary
        ref={summaryRef}
        className="relative grid size-9 cursor-pointer list-none place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label={
          unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications, none unread'
        }
      >
        <BellIcon className="size-4.5" aria-hidden="true" />
        {unreadCount > 0 ? (
          <span
            className="absolute top-0.5 right-0.5 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[0.625rem] leading-4 font-medium text-destructive-foreground tabular-nums"
            aria-hidden="true"
          >
            {unreadCount > BADGE_MAX ? `${BADGE_MAX}+` : unreadCount}
          </span>
        ) : null}
      </summary>

      <span className="sr-only" aria-live="polite">
        {status === 'ready'
          ? unreadCount === 0
            ? 'No unread notifications.'
            : `${unreadCount} unread notifications.`
          : ''}
      </span>

      <section
        className="absolute right-0 z-50 mt-2 w-80 rounded-md border border-border bg-popover shadow-md sm:w-96"
        aria-label="Notifications"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <p className="text-xs font-medium text-foreground">Notifications</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 whitespace-nowrap px-2 text-xs"
            disabled={isMarking || unreadCount === 0}
            onClick={() => void handleMarkAllRead()}
          >
            <CheckCheckIcon className="size-3.5" aria-hidden="true" />
            {isMarking ? 'Marking' : 'Mark all read'}
          </Button>
        </div>

        {status === 'loading' && !feed ? (
          <ul className="flex flex-col p-3" aria-busy="true">
            {SKELETON_ROWS.map((key) => (
              <li key={key} className="flex items-start gap-2 py-2">
                <Skeleton className="mt-1.5 size-2 rounded-full" />
                <span className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-4/5" />
                  <Skeleton className="h-3 w-1/3" />
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {status === 'error' && !feed ? (
          <div className="flex flex-col items-start gap-2 p-3">
            <p className="text-xs text-muted-foreground">{loadError}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="whitespace-nowrap"
              onClick={() => void loadFeed()}
            >
              <RefreshCwIcon className="size-3.5" aria-hidden="true" />
              Retry
            </Button>
          </div>
        ) : null}

        {feed && feed.notifications.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">
            Nothing yet. Agent runs, publishes, and failures will show up here.
          </p>
        ) : null}

        {feed && feed.notifications.length > 0 ? (
          <ul className="flex max-h-96 flex-col overflow-y-auto">
            {feed.notifications.map((entry) => (
              <li key={entry.id} className="border-b border-border last:border-b-0">
                <a
                  href={entry.link ?? '/dashboard/notifications'}
                  onClick={() => void markEntryRead(entry)}
                  className="flex items-start gap-2.5 px-3 py-2.5 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span
                    className={cn(
                      'mt-1.5 size-2 shrink-0 rounded-full',
                      notificationLevelDotClass(entry.level),
                      entry.readAt === null ? '' : 'opacity-40',
                    )}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block truncate text-xs',
                        entry.readAt === null
                          ? 'font-medium text-foreground'
                          : 'text-muted-foreground',
                      )}
                    >
                      {entry.title}
                    </span>
                    <span className="mt-0.5 block text-[0.6875rem] text-muted-foreground tabular-nums">
                      {formatRelativeTime(entry.createdAt)}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="border-t border-border px-3 py-2">
          <a
            href="/dashboard/notifications"
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            View all notifications
          </a>
        </div>
      </section>
    </details>
  );
}
