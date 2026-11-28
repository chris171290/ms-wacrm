# Automations and scheduled jobs

## Unanswered conversations

Create an automation with the **Unanswered Conversation** trigger, set the
number of minutes to wait, and add a **Send Email** step. The recipient list
contains account owners and admins; multiple recipients can be selected.
Recipients are resolved and checked against the account's current owner/admin
memberships when the email is sent.

The scanner only considers open or pending conversations with an assigned
agent and a positive unread count. The latest customer message must be from
the current day in `America/Guayaquil`. It compares that message with the
latest human-agent message; bot messages do not count as an agent reply. An
alert is sent once per automation and customer message. A later customer
message starts a new waiting period. Failed sends are retried by later cron
runs.

The cron route needs the shared `AUTOMATION_CRON_SECRET` and must be called
with that value in the `x-cron-secret` header. Schedule
`GET /api/automations/cron` every minute; each run also drains pending
automation Wait steps. Apply
`supabase/migrations/20261127183400_unanswered_conversation_alerts.sql` and then
`supabase/migrations/20261127231200_filter_unanswered_conversation_alerts.sql`
before activating the new trigger. The latter updates the scanner to require
unread conversations and a latest customer message from the current Guayaquil
calendar day.

## SMTP

Set these server-side environment variables (do not prefix them with
`NEXT_PUBLIC_`):

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-username
SMTP_PASSWORD=your-smtp-password
SMTP_FROM="WhatsApp CRM <notifications@example.com>"
```

Use `SMTP_SECURE=true` for implicit TLS, commonly port 465; for STARTTLS, such
as port 587, use `false`. `NEXT_PUBLIC_SITE_URL` is also recommended so the
email's conversation link points to the deployed app.

The **Send Email** step keeps the body editor simple and sends the content as a
branded HTML email using the app's violet theme, with a plain-text fallback.
URLs in the body are rendered as clickable links. The subject and body support
these placeholders:

- `{{contact.name}}`
- `{{contact.phone}}`
- `{{agent.name}}`
- `{{message.text}}`
- `{{conversation.url}}`
