# Notifications

Notifications tell you what the system is doing without you watching the Activity page. Every notable event is recorded in the dashboard, and the events that matter can also be delivered to your inbox or to Telegram, both free.

## Where to see them

- **The bell in the dashboard header.** It polls every twenty seconds and shows an unread badge, the eight newest notifications, and a **Mark all read** button. Clicking an entry opens the page it came from.
- **The Notifications page** (`/dashboard/notifications`), in the sidebar under System. It lists every notification with filters by level and category, a **Load more** button, per-row **Mark read** and **Mark unread**, and a **Clear read** button that deletes only notifications you have already read.
- **Delivery settings** are on the same page, under the list.

Nothing is ever deleted automatically except the read notifications you clear by hand. The retention job keeps notifications for ninety days, the same window as the activity log.

## What is recorded

| Event | Level | Delivered by default |
| --- | --- | --- |
| An agent starts a run | Info | Yes |
| An agent finishes a run | Success | Dashboard only |
| An agent run fails | Error | Yes |
| A run is closed automatically after twenty minutes | Warning | Yes |
| An agent fails three runs in a row | Error | Yes |
| DeepSeek rejects a request | Error | Yes |
| A post is published, on schedule or by hand | Success | Yes |
| Search budget runs low | Warning | Yes |
| A sharing channel needs attention | Warning | Dashboard only |

A run start is delivered as soon as the run is past its budget and key checks, so you are not told about a run that was skipped before it did any work. With a fifteen minute tick and several agents, that is the noisiest event in the list; untick it under **Push these events** if it becomes too much. Finished runs stay inside the dashboard on purpose, because a start followed by a failure already tells you the run did not end well.

Failures are throttled so a broken account cannot flood you: the same agent failing with the same error is reported at most once an hour, and a DeepSeek failure at most once every thirty minutes. A publish is never throttled.

## Email delivery, and why it is free

Email goes out through Cloudflare Email Routing. Sending to a **verified destination address** in your own Cloudflare account is free on every plan, is not counted against the monthly sending quota, and is not counted against the daily sending limit. You do not need a Workers Paid plan for this.

Setup, once:

1. In the Cloudflare dashboard, open the zone you want to send from (for example `lightscripts.com`) and enable **Email Routing**.
2. Add your own address as a **destination address** and click the verification link Cloudflare emails you.
3. On the Notifications page, tick **Send important notifications by email**.
4. Set **Recipient address** to the address you just verified.
5. Set **Sender address** to any address on a domain with Email Routing enabled, for example `notify@lightscripts.com`.
6. Set **Dashboard URL** to the host that serves the dashboard. It defaults to `https://admin.hadinata.me`, which is the host the dashboard is served on today.
7. Click **Save settings**, then **Send test**.

The `send_email` binding in `wrangler.jsonc` carries no recipient restriction, but Cloudflare only accepts recipients that are verified destination addresses in your account, so the binding cannot be used to mail a stranger.

One quirk worth knowing: an email sent from a Worker is listed as **dropped** in the Email Routing summary even when it was delivered. That summary tracks inbound routing. Use the Email Sending logs and metrics to confirm outbound delivery.

## Telegram delivery

Telegram is free, has no quota, and arrives as a push notification on your phone.

Setup, once:

1. Open Telegram and talk to **@BotFather**. Send `/newbot`, pick a name, and copy the token it returns.
2. Send any message to your new bot, then open `https://api.telegram.org/bot<token>/getUpdates` and copy the `chat.id` value from the response.
3. On the Notifications page, tick **Send important notifications to Telegram**.
4. Paste the **Chat id** and the **Bot token**.
5. Click **Save settings**, then **Send test**.

The bot token is encrypted with the `AGENT_SECRET_KEY` Worker secret before it is stored, and it is never shown again in full. The field shows a masked hint such as `123••••abcd`. Leave the token field empty when you save to keep the stored one.

Notification messages are sent as plain text, without Telegram markup, so text that originated from a model cannot alter the message formatting.

## Choose which events leave the system

The **Push these events** switches on the Notifications page control what is delivered. Everything is always recorded in the dashboard regardless of these switches. Unticking an event stops it from being delivered by email and Telegram, and the notification stays visible in the bell.

## When delivery fails

A delivery that fails is retried by the cron Worker on its next tick, at most three times. If at least one channel accepted the message, it is not retried, so you never receive the same notification twice on a channel that already worked. A notification whose delivery failed shows a **Delivery failed** badge on the Notifications page.

Delivery never blocks the work that triggered it. A failing channel cannot fail an agent run, and a slow channel cannot hold one open: each send has an eight second deadline.

## Troubleshooting

- **No email arrives.** Check the spam folder first, then confirm the recipient is a verified destination address, that Email Routing is enabled on the sender's domain, and that **Send test** reports success. `E_SENDER_DOMAIN_NOT_AVAILABLE` or `E_RECIPIENT_NOT_ALLOWED` means one of those two is not set up.
- **No Telegram message arrives.** `chat not found` or `Unauthorized` means the chat id or the token is wrong. Send a message to the bot first, because a bot cannot start a conversation.
- **Everything stopped at once.** Check the Notifications page for a `DeepSeek failure` entry. An exhausted DeepSeek balance fails every run until you top up the account.
- **Too few notifications.** A finished run is dashboard-only by design; a start followed by a failure already tells you the run did not end well. Tick the event under **Push these events** if you want it delivered too.
- **Too many notifications.** The noisiest event is a run start, because every run sends one. Untick it under **Push these events**, or leave the failure events ticked and let the run starts stay in the dashboard.
- **A run start arrived for a run that did nothing.** It should not: a start is only reported after the run passes its budget and key checks. If you see one, the run was skipped for a reason found later in the run, such as no pending draft to review.

## Not built yet

- There is no digest. Each event is delivered on its own, not batched into a daily summary.
- There are no quiet hours. Delivery is not suppressed at night.
- WhatsApp is not supported. The channel layer is provider-based, so a provider can be added later, but nothing ships for it today.
- There is no per-channel filter. A ticked event goes to every enabled channel.
