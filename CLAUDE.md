# Microsite checklist — standing rules for every project

This repository is one of the PNZ channel-partner microsites (Bangalore and
Hyderabad). Every microsite is built, checked and launched against the
checklist below. Follow it on every change, and audit against it when asked to
"go through the checklist".

## Phase 1 · Branding (step 3)

Open the developer's own website and capture, then mirror on the microsite:
- Colour palette (e.g. white and gray page backgrounds, dark footer).
- Font family (e.g. Inter). If the builder's font is licensed (e.g. Proxima
  Nova on brigadegroup.com), use its closest free Google font and say so.
- Overall design style.

Builder brand colours drive the theme. Self-host the font files under
`site/fonts/` (latin + latin-ext woff2, `font-display: swap`, preload the latin
file): loading them from fonts.googleapis.com cost ~20 points of mobile
PageSpeed on these sites.

## Phase 2 · Build rules (step 4)

- **Never use the builder's logo.** Use a first-letter monogram of the builder
  name in the builder's colours (the `.brandmark_badge` lettermark).
- **No RERA details anywhere**: no RERA number, status or link. For a
  pre-launch project never write "RERA not obtained", "RERA pending",
  "registration awaited" or anything similar — leave it out entirely.
- **No source attribution anywhere**: no "Source:" lines, credits, or mentions
  of the platform, company or document the information came from ("as
  published by …", "… brochure lists", "environmental application records …",
  "as reported", "<Builder> render", "from <Builder>'s pages"). State facts
  directly. The hidden form field `lead_source` = `PNZ MS Lead` stays.
  "This website is operated by a channel partner. It is not the official
  website of <Builder>" is a disclaimer, not attribution, and stays.
- Both rules cover every page, FAQs, image alt/title text, figcaptions, page
  titles, meta descriptions, og/twitter tags, meta keywords, JSON-LD schema,
  llms.txt, llms-full.txt and site.webmanifest.
- Missing images come from the same builder's other projects of the same type
  (apartment → apartment, villa → villa); captions may name the project shown.
- Schema markup (JSON-LD) on all pages, plus llms.txt and robots.txt.
- Mobile-first layout · 95+ Google PageSpeed on desktop and mobile.

### Contact form hidden fields (lead tracking)

Every enquiry form carries:
```html
<input type="hidden" name="lead_source" value="PNZ MS Lead">
<input type="hidden" name="Project Name" value="<the project's name>">
```
`site/js/form-handler.js` sends them as `lead_source` and `project`; the
Worker prints `Project:` and `Source:` lines in Telegram and email.

### Auto pop-up lead modal (`site/js/contact-popup.js`)

- Opens automatically 5–10 seconds after landing (currently 8 s).
- Once per session: does not reappear on other pages or after it is closed
  (`sessionStorage`), and never again once a lead is sent (`localStorage`).
- Same hidden fields (`Project Name`, `lead_source` = PNZ MS Lead), posts to
  the same `/api/lead`, so it reaches Telegram and email like the form.
- Closes on X, Esc and a click outside; compact bottom sheet on phones.
- Script tag is `defer` and the modal is built only after `window` load, so
  PageSpeed stays 95+.

## Phase 3 · Content QA (step 5)

Review every page against the rules above:
- All links work (internal and the sibling-microsite links).
- All forms submit correctly (`node worker/test.mjs` passes).
- No RERA mentions anywhere: `grep -rni rera site/` prints nothing.
- No source/attribution lines naming a platform or company.

## Phase 4 · Outbound backlinks (step 6)

Link from this microsite to every sibling microsite in the same city (the
"Do you have other projects in …?" FAQ list): Bangalore → all Bangalore
microsites; Hyderabad → all Hyderabad microsites. Only link to domains that are
live. The master list is the tracker sheet (below). Known corrections to it:
- Sattva Hill View's live microsite is `sattvahillviews.info` (the sheet says
  sattvahillview.com, which is not ours).
- KNS Samooha's microsite is `knssamooha.info` (`knssamooha.net.in` is another
  company's site — never link it).
- `adarshparklandphase2.com` (Adarsh Parkland Phase 2) is ours but missing
  from the sheet.

## Phase 5 · Domain (step 7)

- Extension priority: 1st `.com` · 2nd `.net` or `.info`.
- Pre-launch project (no project name yet): developer name + project location.
- Named project: developer name + project name.

## Phase 6 · Go-live setup (in order, once the domain is connected)

8. www redirect: redirect `www` to the root domain (Cloudflare Redirect Rule,
   not `_redirects`).
9. Telegram bot: every form submission posts to Telegram
   (`TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_IDS` as Worker secrets).
10. Email routing: all submissions to raghuvalekar1515@gmail.com
    (`LEAD_EMAIL_TO`; verify the destination address in Email Routing).
11. Google Search Console verification — only after SSL is active and the site
    is live: add the domain property, copy the HTML tag and the HTML file, add
    both to the site, then click Verify.
12. Sitemap: submit `sitemap.xml` in Search Console; confirm it is read with no
    errors.
13. Request indexing (manual limit ~10 URLs/day). Order: landing page,
    overview, FAQs, location, contact, then the rest. If other microsites
    launch the same day, index only each landing page that day and continue on
    following days.

## Phase 7 · Live test (step 14)

Submit the live contact form and confirm it reaches Telegram and
raghuvalekar1515@gmail.com with Project Name and Source = PNZ MS Lead. The
pop-up must open within 5–10 s and its test submission must also reach
Telegram and email.

## Phase 8 · Tracking and inbound backlinks

15. Add the project to the tracker sheet under Bangalore or Hyderabad:
    https://docs.google.com/spreadsheets/d/1QP4yT0hh45JhuieE-co5nWX-7l0qvfShWyk3RglAQdE/edit
16. Add a backlink to this microsite from every previous microsite in the
    same city (Bangalore → every Bangalore microsite; Hyderabad → every
    Hyderabad microsite).
