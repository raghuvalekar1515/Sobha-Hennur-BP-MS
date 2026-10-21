# Sobha Hennur

Static website for Sobha Hennur, a pre-launch Sobha township in the Hennur Road corridor,
North-East Bengaluru. Built on the Ira Moonglade Webflow
template, served from Cloudflare Workers, with lead capture to KV plus email,
Telegram and the shared Google Sheet.

## Read before editing

> **Built against `CLAUDE.md`**, the standing microsite checklist: no RERA wording
> anywhere, no source attribution, Sobha's palette and type (self-hosted under
> `site/fonts/`), the "S" monogram instead of the builder's logo, the hidden
> `Project Name` and `lead_source` fields on every form, the 8-second pop-up, and
> no em dashes anywhere in the copy (the build fails if one appears).
>
> **The design mirrors sobha.com**: a black header and footer, tracked uppercase
> headings, square black buttons, white and #f8f9fc bands, the towers at dusk beside
> the words with the key figures on a black bar, and the pictures on a black band.
> Pages, forms, the pop-up and every feature are the same as the other microsites.
>
> **Every picture is the project's presentation imagery**: the towers at dusk and at
> sunset, a living room, the garden walk, the sports court, the arrival canopy, the
> clubhouse lounge, the aerial master plan, the 3D layouts of the nine home types
> (captioned as indicative) and the service illustrations. Replace them with Sobha's
> own pictures and plans when they are released.
>
> **THE SAME LAND AS SOBHA CHIKKAGUBBI.** Sobha Hennur and Sobha Chikkagubbi are two
> names for one Sobha land parcel (the same facts and pictures on both source sites).
> This microsite is written separately, from the Hennur Road side, with its own copy,
> FAQs, design and picture order, so the two do not read as duplicates.
>
> **THE DOMAIN IS A PROPOSAL.** `sobha-hennur.info` is developer + project name, as the
> checklist asks; `sobhahennur.com`, `.net` and `.info` are all other parties' live
> sites (17 October 2026). `sobha-hennur.net`, `sobhahennurroad.net` and
> `sobhahennurroad.info` were also free. The domain is in every canonical URL, the
> sitemap, the schema and the llms files: if you choose another, rebuild.

The layout is the Webflow export's. Its copy, pictures, logo and palette are this
project's, generated from one facts file; the classes, Webflow ids,
interactions, contact form and its hidden `lead_source` input (below) are the
template's own.

```
site/            The Webflow export. The only directory served.
  *.html         13 pages
  robots.txt sitemap.xml   crawler files
  css/ fonts/    styles and the self-hosted fonts
  images/        pictures: WebP, narrower copies for phones, AVIF twins
  js/webflow.js  Webflow runtime (interactions, sliders, nav)
  js/form-handler.js   posts the contact form to /api/lead
worker/
  index.js       lead endpoint; everything else falls through to site/
  test.mjs       49 assertions, no dependencies
wrangler.jsonc   bindings and deploy config
```

Keeping `worker/` outside `site/` is structural, not cosmetic: nothing but
`site/` is ever served, so Worker source can never be fetched however the repo
grows later.

---

## Architecture

```
Browser ──▶ Cloudflare Worker
              ├── POST /api/lead        → validate → KV → notify (email, Telegram, Google Sheet)
              ├── GET  /api/lead/status → which channels are configured
              └── everything else       → static assets from ./site
```

One Worker. No server, no database, no build step - the HTML is committed as
built.

The order inside the endpoint is the whole design:

```js
await env.LEADS.put(key, JSON.stringify(record));   // 1. store first
ctx.waitUntil(Promise.all([notifyTelegram(), notifyEmail()]));  // 2. notify, not awaited
return json(200, { ok: true });                     // 3. respond
```

The lead is durable **before** any notification is attempted, and notification
is never awaited. A revoked token, an unverified address or a provider outage
costs a notification, never the enquiry.

### Lead source

Each contact form carries two hidden fields as its first children:

```html
<input type="hidden" name="lead_source" value="PNZ MS Lead">
<input type="hidden" name="Project Name" value="Sobha Hennur">
```

`form-handler.js` sends the second as the lead's project (the Worker prints it as a
`Project:` line) and reads the first into the payload and the Worker stores it on the
record and prints it as a `Source:` line in both the Telegram message and the
email, so enquiries from different campaigns are told apart.

Three places, because both layers whitelist their fields - adding the input
alone would submit nothing:

| Change the value | `value="…"` in the ten pages with a contact form |
| --- | --- |
| Send a different field | `payload` in `site/js/form-handler.js` |
| Store or format it | `LIMITS`, `validate()`, `formatLead()` in `worker/index.js` |

The field is optional at every layer. A page cached before it existed, or
another Webflow export without it, still submits; the `Source:` line is simply
omitted. It is **not** the spam honeypot - that is a separate `company` field
injected by script and never stored. This one is a real submitted value.

Deliberately left without the field: `401.html` (Webflow's password gate, which
posts to `/.wf_auth`) and `style-guide.html` (the component reference page).
Neither produces a lead, and `form-handler.js` skips both.

---

## Deploying

Do these in order. Storage and the status endpoint come before any
notification channel, so that when mail misbehaves you can already see what was
captured and what is configured.

### 1. KV namespace

Create it and paste the id into `wrangler.jsonc` (it reads
`REPLACE_WITH_KV_NAMESPACE_ID` until then). Named per project, matching the
other microsites on the account, because a Worker bound to the wrong namespace
would mix two clients' enquiries together.

```sh
npx wrangler kv namespace create sobha-hennur-bp-ms-leads
```

Until a real id is in place `wrangler deploy` fails with
`KV namespace '…' is not valid [code: 10042]` - deliberately. A deploy that
succeeded without storage would put a live form in front of visitors with
nowhere to keep what they send.

### 2. Deploy

Via **Workers → Import a repository**:

- Production branch: this branch
- Build command: **empty** (nothing to build)
- Deploy command: `npx wrangler deploy`

Every push then redeploys. Confirm the site serves before going further.

### 3. Custom domain

**Workers → Settings → Domains & Routes → Add → Custom Domain**, for the apex
**and** `www`. You add no A or CNAME record yourself: Workers custom domains
require the zone on Cloudflare and Cloudflare writes the record.

`sobha-hennur.info` is a proposal (the unhyphenated names are taken). Register it
(or your choice, then rebuild) and add the zone to Cloudflare first - every page's
canonical points at it.

### 4. Email

1. **Email Service → Email Routing** → enable for `sobha-hennur.info`.
   Cloudflare adds MX, SPF and DKIM itself.
2. **Destination Addresses** → add the recipient → **click the verification
   link**. Mail will not send until this is done.

No routing *rule* is needed; those are for receiving. `LEAD_EMAIL_FROM` need not
be a real mailbox - only the domain must be onboarded - but replies to it
bounce, which is why it is `no-reply@`.

Mail to a verified Email Routing destination is free on every plan and counts
against no quota.

### 5. Telegram (optional)

```sh
npx wrangler secret put TELEGRAM_BOT_TOKEN   # @BotFather → /newbot
npx wrangler secret put TELEGRAM_CHAT_IDS    # comma separated
```

**Open the bot and press Start first.** Telegram forbids a bot from messaging
anyone who has not contacted it; skip this and every send returns *chat not
found*. Read the id from `api.telegram.org/bot<TOKEN>/getUpdates`.

Always choose **Secret**, never a dashboard *Text* variable - plain-text
variables are owned by `wrangler.jsonc` and are wiped by the next deploy.

---

## Google Sheet

Every lead is also added to the shared **PNZ MS Leads** Google Sheet, beside
Telegram and email. Nothing needs setting for it: this Worker holds no URL or
secret. The `LEAD_SHEET` service binding in `wrangler.jsonc` calls the
`LeadSheet` entrypoint of the **assetz-mizu-ki** Worker in the same Cloudflare
account, which holds them and writes the row. `/api/lead/status` reports
`"sheet":{"configured":true}` once deployed.

The row's Page URL column is the full URL (`https://sobha-hennur.info/price`),
which is how the shared sheet tells this site from the others. Every row also
names the project, the same whatever page or form the lead came from: Project
Name `Sobha Hennur`, City `Bangalore`, Project Zone `East Bangalore`, Project
Status `Pre Launch`, Project Type `1, 2, 3 & 4 BHK Apartments` and Project Location
`Hennur Road` (`SHEET_PROJECT` in `worker/index.js`). Lead City is the visitor's
city, as Cloudflare places them from their IP address: a guide, not an
address. Keep **assetz-mizu-ki** deployed under that
name: if it is ever renamed or deleted, leads here are still stored, emailed
and sent to Telegram, and only the sheet row is missed (the log says
`google sheet append threw`). Problems with the sheet itself are diagnosed
there: `https://assetz-mizu-ki.com/api/lead/status?check=sheet`.

```sh
node worker/sheet.test.mjs   # the sheet channel, no account needed
```

## Verifying

```sh
node worker/test.mjs        # 49 assertions, no account needed
```

After a deploy, through the edge cache - `cf-cache-status: HIT` will otherwise
serve a stale page and make a correct change look broken:

```sh
D=https://sobha-hennur.info
C=$(date +%s)

curl -s "$D/?cb=$C" | md5sum; md5sum site/index.html   # deployed matches local
curl -s "$D/api/lead/status?cb=$C"                     # which channels are on
```

Then read the logs with `npx wrangler tail`. Every outcome is logged:

| Log line | Cause |
|---|---|
| `lead stored …` | saved to KV - always first |
| `email not configured; no recipient set` | `LEAD_EMAIL_TO` unset |
| `email send failed … not verified` | destination address never verified |
| `telegram config incomplete` | token without chat ids, or the reverse |
| `… status=400 chat not found` | wrong chat id, or Start never pressed |
| `… status=401` | token wrong or revoked |

Read captured leads in the dashboard under **Storage & Databases → KV → leads**.
Keys are `lead:<ISO timestamp>:<id>`, so they sort chronologically. There is
deliberately **no endpoint to read leads back**: an unauthenticated one would
publish every enquirer's name, email and phone number.

---

## Notes

**Recipient address.** `LEAD_EMAIL_TO` sits in `wrangler.jsonc` because this
repository is private. Neither it nor the sender reaches the browser. If the
repo is ever made public, delete that line and
`npx wrangler secret put LEAD_EMAIL_TO` instead - set one or the other, never
both.

**Phone validation is deliberately permissive.** The form is `type="tel"` with
no pattern, so a visitor abroad can type a country code that the browser
accepts. An Indian mobile is normalised to ten digits; any other 8–15 digit
number is kept rather than rejected, because losing an overseas enquiry costs
more than storing an odd number.

**Editing.** Every page is generated from one facts file, so a change to the
copy, a figure or a picture is best made as a rebuild, which carries it to
every page, the schema and the llms files at once. A one-off edit can go
straight into the HTML.

## Contact pop-up

`site/js/contact-popup.js` opens an enquiry form 8 seconds after the visitor
lands, once per browser session (not again on another page or after it is
closed). It closes on X, Esc or a click outside, and is a compact sheet at
the foot of the screen on phones. Its design follows the enquiry dialog on the DSR Ciel and Sri Tirumala
Legacy sites: a native `<dialog>` with name, phone and email, and a button
carrying the same classes as the contact form's.

It is loaded on every page except `401.html` by the small script before
`</body>` that loads jQuery and webflow.js after the first paint (see Speed),
and brings its own markup and styles, so the Webflow markup is untouched.
Leads post to `/api/lead` with the same fields as `form-handler.js`, carrying
the page's own `lead_source` (or `LEAD_SOURCE` on a page without a form) and
a fixed message, since the Worker requires one.

It does not open once this browser has sent a lead, from the pop-up or the
page's own form (`form-handler.js` sets the same flag), over another open
dialog, or while the visitor is typing in a form on the page. `PROJECT`,
`LEAD_SOURCE`, `BUTTON_CLASS` and `DELAY_MS` are at the top of the file. When
re-exporting from Webflow, re-add its `<script>` line along with
`form-handler.js`'s.

## Go-live checklist

`CLAUDE.md` is the standing microsite checklist this site was built and checked
against. What is left once the domain is connected (its phases 6 to 8):

1. Redirect `www.sobha-hennur.info` to `sobha-hennur.info` (a Cloudflare Redirect Rule).
2. Telegram: `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_IDS` as Worker secrets (below).
3. Email Routing: verify the `LEAD_EMAIL_TO` destination address.
4. Google Search Console, once SSL is active: add the domain property, add the HTML
   tag and the HTML file to the site, then Verify.
5. Submit `sitemap.xml` and confirm it is read without errors.
6. Request indexing (about ten URLs a day): home, overview, FAQs, location, contact,
   then the rest.
7. Live test: submit the contact form and the pop-up, and confirm both reach Telegram
   and email with Project Name and Source = PNZ MS Lead.
8. Add the site to the tracker sheet under Bangalore, and link it from every other
   Bangalore microsite's "Do you have other projects in Bengaluru?" list.

## Speed

Every page was measured with Lighthouse (the engine behind PageSpeed Insights),
on a phone and a desktop profile, before delivery. Keep these in place when
editing:

- jQuery and webflow.js load after the first paint, from the small script
  before `</body>`, rather than as deferred scripts, which ran before it.
  `form-handler.js` stays deferred, so every form is guarded from the start.
- Pictures carry narrower copies (`-480`, `-720`) in their `srcset`, so a phone
  downloads one that fits, and an AVIF twin is offered first in a `<picture>`, with
  WebP as the fallback.
- The hero picture is fetched first (`fetchpriority="high"`), as is the first
  picture on the gallery page; pictures below the first screen load lazily.
- The latin files of the fonts the first screen uses are preloaded, and every
  face uses `font-display: swap`.
- Cloudflare compresses the HTML, CSS and JavaScript itself.

## Colour

White and `#f8f9fc` pages, a black header, key-figures bar, gallery band and footer, square `#000000` buttons, `#7d5f00` labels and links, and `#f3c033` gold on black.

The palette and type are Sobha's own, from sobha.com: white and #f8f9fc pages, a
black header and footer, #343434 text, square black buttons and outlined small
ones, and its #f3c033 gold (deepened to #7d5f00 wherever it is text on white, for
contrast). Text is Inter, the typeface sobha.com is set in: light for text and
regular for the tracked uppercase headings. Every value was contrast-measured
before use.

The Webflow export was built dark, so the palette is repointed at its
source rather than rule by rule: the light-theme block at the end of
`site/css/sobha-hennur.webflow.css` redefines the export's own custom
properties, then overrides only the rules that hard-code a dark
background. Change `--riv-accent` there and every button, label, link,
table stripe and the lettermark follow. The generated tokens still read
`purple` and `gold` because those are Webflow's names; what they resolve
to is set in that block.

Contrast was measured rather than assumed - every rendered text element
across all 13 pages, none below WCAG AA. The favicon and apple-touch
icon are drawn from the same two values.

## Telegram notifications

The Worker can post every lead to Telegram as well as e-mail. Nothing is
configured for this project yet. To switch it on, create a bot with
@BotFather, get the chat id(s) you want it to post to, and set both as
Worker secrets - not as vars in `wrangler.jsonc`, which would put the token
in the repository:

```sh
# the argument is the NAME; the value is typed at the prompt
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_IDS   # comma-separated
```

For local testing put both in `.dev.vars`, which is already git-ignored.
A second and third bot can be added as `TELEGRAM_BOT_TOKEN_2` /
`TELEGRAM_CHAT_IDS_2` and `_3`; the Worker posts to each configured pair.
Leads still reach e-mail, KV and the Google Sheet whether or not Telegram is set up.
