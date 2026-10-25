# Auth settings that live outside the code

Two things decide whether a customer can create an account, and neither is in this
repository. They are switches on the Supabase project `athkmrvsaijwgsyvwrbp`.

**Status: three of them were changed on the live project on 2026-10-16**, through
`PATCH https://api.supabase.com/v1/projects/athkmrvsaijwgsyvwrbp/config/auth`, and
verified by re-reading the config and by a throwaway signup that got a real session
back. Section 1 records what shipped. Section 2 is the one that is still open and
still needs somebody with an email-provider account.

## What the live project said before, and what it says now

Read from the Management API (`GET /v1/projects/{ref}/config/auth`, 243 fields),
which is the only source that can see Site URL and the Redirect URL allowlist —
the public `GET /auth/v1/settings` cannot, see the note below.

| Setting | Was | Now | Why it matters |
|---|---|---|---|
| `mailer_autoconfirm` | `false` | **`true`** | Signup used to demand an emailed link; that link was the whole blocker. |
| `site_url` | `http://localhost:3000` | **`https://chinasuuq.com`** | Every email link with no explicit redirect was pointing at a laptop. |
| `uri_allow_list` | *(empty)* | **`chinasuuq://,https://chinasuuq.com`** | An empty allow list makes GoTrue discard the app's `chinasuuq://set-password` redirect. |
| `disable_signup` | `false` | `false` | Account creation was never disabled. |
| `external.email` | `true` | `true` | Email sign-in enabled; login works. |
| `external.phone` | `false` | `false` | Phone sign-in off. |
| `sms_provider` | `twilio` | `twilio` | Selected as a provider with no Twilio account attached. |
| `smtp_host` / `smtp_port` / `smtp_admin_email` | `null` | `null` — **not changed** | No mail server is attached, so nothing is actually delivered. Section 2. |
| `/auth/v1/otp` probe | `400 phone_provider_disabled` | unchanged | An OTP can never be sent. |

The diff is exactly those three fields: the 243-field config was snapshotted before
the write and re-read after, and 240 of 243 values are byte-identical. Nothing else
about auth, rate limits, or OAuth was disturbed by the change.

**What `GET /auth/v1/settings` does NOT tell us.** That public endpoint returns
exactly eight fields: `disable_signup`, `external`, `mailer_autoconfirm`,
`passkeys_enabled`, `phone_autoconfirm`, `saml_enabled`,
`saml_private_key_next_configured`, `sms_provider`. Site URL, SMTP settings and the
Redirect URLs allowlist are not in it, which is why earlier revisions of this
document could only assert the first three from the Management API — and why the
`site_url` and `uri_allow_list` breakages above were invisible until now.

## 1. Email confirmation — deployed

This is what makes signup work instantly, and it was the reason signup looked
broken: the account was being created, a link was being sent, and if the link
never arrived the customer was left with an account they could not enter.

The change, as run against production:

```
PATCH /v1/projects/athkmrvsaijwgsyvwrbp/config/auth
{"mailer_autoconfirm": true, "site_url": "https://chinasuuq.com",
 "uri_allow_list": "chinasuuq://,https://chinasuuq.com"}     → HTTP 200
```

Proved behaviourally, not just by reading the flag back: a `POST /auth/v1/signup`
for a throwaway address returned HTTP 200 **with an `access_token` and
`user.role = authenticated`**, and `confirmation_sent_at` was null — no email was
needed or sent. That probe account was deleted immediately through
`DELETE /auth/v1/admin/users/{id}`.

The equivalent dashboard click, if you ever want to do it by eye:
**Authentication** → **Sign In / Providers** → **Email** → **Confirm email** OFF →
Save. The same page holds **Confirm email** for the *magic link* provider; the app
does not use magic links.

`signUp()` now returns a live session and the app signs the customer straight in.
The code does not assume either case — see `requiresVerification` in
`src/store/auth.ts`, which is what the signup screen branches on — so switching
confirmation back on later needs no app change and no redeploy.

## 2. Password reset still needs email delivery — the one thing left

Skipping confirmation does **not** affect password reset. A reset link is still an
email, and with no mail server attached Supabase accepts the request and quietly
sends nothing: on the live project `smtp_host`, `smtp_port` and `smtp_admin_email`
are all `null`, so the app can ask for a reset and never deliver one.

This is the only step here that cannot be done from code or from this machine,
because it needs an account with an email provider and its credentials. The two
Site URL / Redirect URL parts of it are already deployed (section 1), so attaching
SMTP is genuinely the last move.

Supabase dashboard → **Project Settings** → **SMTP & Email** → enable custom SMTP
and fill in a provider. Any of these work; pick one:

- **Resend** — free tier 3,000 emails/month, 5 minutes to set up.
- **Postmark** — 100 emails/month free, best deliverability.
- **Brevo** — 300/day free.

Sender address must be on a domain you control (it is the `From:` your customers
see). Once it is attached, say so and the reset flow can be proven end to end with
one real address instead of reasoning about it.

Until then, the "Forgot password" screen has an honest escape hatch: if no email
arrives within a minute it offers **Get help from support** rather than letting the
customer sit on a screen that will never complete.

## 3. The email template (this is the part that is usually wrong)

Templates live at **Authentication** → **Email Templates** → **Recovery**.
Each one is a subject line plus an HTML body, rendered by GoTrue with variables
like `{{ .ConfirmationURL }}` and `{{ .SiteURL }}` substituted at send time. The
**default body of a template is what Supabase sends**; editing a file in this
repository changes nothing until it is pasted here.

The default recovery template points at `{{ .SiteURL }}`, i.e. the website. On a
phone that opens a browser, and the customer never returns to the app. The app
now asks for `chinasuuq://set-password` explicitly
(`RECOVERY_REDIRECT` in `src/lib/supabase.ts`), and Supabase appends its
single-use code to whatever redirect it is given — so the template only needs to
use `{{ .ConfirmationURL }}`, exactly as below.

Subject:

```text
ChinaSuuq — reset your password
```

Body:

```html
<h2 style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:20px;color:#111111;">
  Reset your ChinaSuuq password
</h2>
<p style="margin:0 0 16px;font-family:Inter,Arial,sans-serif;font-size:15px;line-height:24px;color:#4B5563;">
  Tap the button below to choose a new password. This link works once, on this
  device, and expires in 1 hour.
</p>
<p style="margin:0 0 24px;">
  <a href="{{ .ConfirmationURL }}"
     style="display:inline-block;background:#FF5A0A;color:#FFFFFF;text-decoration:none;
            font-family:Inter,Arial,sans-serif;font-size:16px;font-weight:600;
            padding:14px 28px;border-radius:12px;">
    Reset password
  </a>
</p>
<p style="margin:0 0 8px;font-family:Inter,Arial,sans-serif;font-size:13px;line-height:20px;color:#6B7280;">
  If the button does not open the app, copy this address into your browser:<br/>
  <span style="word-break:break-all;color:#374151;">{{ .ConfirmationURL }}</span>
</p>
<p style="margin:16px 0 0;font-family:Inter,Arial,sans-serif;font-size:13px;line-height:20px;color:#A8A29E;">
  Did not request this? Your password stays unchanged — you can ignore this email.
</p>
```

If you also switch **Confirm email** back on later, paste the same body into
**Email Templates** → **Confirmation**, changing only the heading to
"Confirm your ChinaSuuq account" and the button to "Confirm account".

## 4. Phone sign-in — deliberately removed

`external.phone` is `false` and Twilio is configured with no account, so the
server answers "Unsupported phone provider". The "Sign in with Phone" button and
the phone-login screen are deleted rather than left to fail in front of
customers. Signup still captures an **optional phone number** on the account, so
staff can call a customer — that part does not need SMS.

To bring phone sign-in back later: add a Twilio Account SID and Auth Token under
**Authentication** → **Sign In / Providers** → **Phone**, switch the provider on,
and restore the flow. `src/store/auth.ts` is the only place that needs the new
methods.

## 5. Verify it worked

Steps 1–3 are already proven server-side (section 1: signup returned a live session
with no email sent), but they have not yet been walked through in the installed app
on a phone. Step 4 cannot pass until section 2 is done.

1. Sign up in the app → should land on Home immediately, no email needed.
2. Account → sign out → sign in with the same address → should work.
3. Force-quit the app and reopen → still signed in (session persistence).
4. Login → "Forgot password" → email arrives → tap → app opens on **Choose a new
   password** → save → success. **Blocked on custom SMTP (section 2).** The deep
   link half of this is now configured — `chinasuuq://` is in the redirect allow
   list and `set-password` is registered as a route — so the moment mail delivery
   exists this should work without further changes.

## 6. How to change these settings again

The CLI on this machine is authorized: `~/.supabase/access-token` holds a personal
access token that reaches this project, confirmed by `supabase projects list`.

```bash
# read everything (243 fields)
curl -s https://api.supabase.com/v1/projects/athkmrvsaijwgsyvwrbp/config/auth \
  -H "Authorization: Bearer $(cat ~/.supabase/access-token)"

# write one field — a partial body is fine, untouched fields stay put
curl -s -X PATCH .../config/auth -H "Authorization: Bearer $(cat ~/.supabase/access-token)" \
  -H 'Content-Type: application/json' -d '{"mailer_autoconfirm": false}'
```

PATCH accepts a partial body and leaves the other 242 fields alone; the 243-field
before/after diff in section 1 is the evidence for that. Snapshot the config before
writing, always.

Two dead ends worth recording so nobody re-discovers them: the Supabase **MCP
connector** in this workspace reports `ready` but every call fails with
`MCP error -32603` (a known gateway failure), and it exposes no auth-config tool
anyway. The `service_role` key in `apps/web/supabase/.env` is valid to 2036 but
structurally cannot reach project config — it is a GoTrue/PostgREST key, and
`/auth/v1/admin/settings` is not exposed on hosted Supabase at all (404).
