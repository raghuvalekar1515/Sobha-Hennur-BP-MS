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
- **RERA only when the project is registered** (the user's rule from
  24 November 2026, replacing "no RERA anywhere"):
  - Registered project: show its RERA registration number exactly as the
    state portal lists it (rera.karnataka.gov.in for Bangalore,
    rera.telangana.gov.in for Hyderabad), with that portal's address next to
    it, e.g. "RERA No. PRM/KA/RERA/…, rera.karnataka.gov.in". Put it in the
    overview facts, the footer of every page, the FAQs and the JSON-LD
    (`additionalProperty` `{"@type": "PropertyValue", "name": "RERA
    Registration Number", "value": "…"}`). Check the number on the portal
    before publishing; never guess one or copy it unchecked from another site.
    The portal address next to the number is part of the registration
    statement, not source attribution.
  - Not registered (pre-launch): leave RERA out entirely. Never write "RERA
    not obtained", "RERA pending", "registration awaited" or anything
    similar. Once the project is registered, add the number.
- **No source attribution anywhere**: no "Source:" lines, credits, or mentions
  of the platform, company or document the information came from ("as
  published by …", "… brochure lists", "environmental application records …",
  "as reported", "<Builder> render", "from <Builder>'s pages"). State facts
  directly. The hidden form field `lead_source` = `BP MS Lead` stays.
  "This website is operated by a channel partner. It is not the official
  website of <Builder>" is a disclaimer, not attribution, and stays.
- Both rules cover every page, FAQs, image alt/title text, figcaptions, page
  titles, meta descriptions, og/twitter tags, meta keywords, JSON-LD schema,
  llms.txt, llms-full.txt and site.webmanifest.
- Missing images come from the same builder's other projects of the same type
  (apartment → apartment, villa → villa); captions may name the project shown.
- **Image names and alt text carry the project name** (the user's rule from
  26 November 2026, every microsite). File names start with the project slug
  and say what the picture shows, plus the project shown when it is another
  project's: `sobha-hennur-clubhouse-<other-project>.webp` (width variants keep
  their suffix: `…-480.webp`, `….avif`). Every `<img>` alt contains the
  project name, at the start where it reads naturally: "Sobha Hennur amenities:
  a clubhouse among gardens". The og:image file and `og:image:alt` follow the
  same rule. `node tools/rename-images.mjs mapping.json` renames every
  variant, rewrites every reference and sets the alt text in one go.
- Schema markup (JSON-LD) on all pages, plus llms.txt and robots.txt.
  The JSON-LD must show 0 errors and 0 warnings at validator.schema.org.
  `ResidentialComplex` is not a schema.org type: use `ApartmentComplex`
  (apartments), `GatedResidenceCommunity` (villas, plots) or `Residence`.
  `developer` is not a schema.org property: give the builder as
  `additionalProperty` `{"@type": "PropertyValue", "name": "Developer",
  "value": "<Builder>"}`. Unit facts (`floorSize`, `numberOfRooms`,
  `accommodationCategory`, prices) are not valid on a complex either; use
  `additionalProperty` for them, and numbers, not text, for counts
  ("3 to 4" BHK is `{"@type": "QuantitativeValue", "minValue": 3, "maxValue": 4}`).
- Mobile-first layout · 95+ Google PageSpeed on desktop and mobile.
- **Framework: Bootstrap 6** for every page (the user's standing rule from
  12 November 2026). Pinned to `bootstrap@6.0.0-alpha.1`, the only v6 release
  so far; move to 6.0.0 when it ships. Bootstrap's CSS is trimmed to the
  classes the pages use and its Drawer plugin is the only script it adds
  (`tools/assets.mjs`); the builder's palette and font are set through
  Bootstrap's own `--bs-*` tokens in `site/css/site.css`.

### Contact form hidden fields (lead tracking)

Every enquiry form carries:
```html
<input type="hidden" name="lead_source" value="BP MS Lead">
<input type="hidden" name="Project Name" value="<the project's name>">
```
`site/js/form-handler.js` sends them as `lead_source` and `project`; the
Worker prints `Project:` and `Source:` lines in Telegram and email.

### Auto pop-up lead modal (`site/js/contact-popup.js`)

- Opens automatically 5–10 seconds after landing (currently 5 s, asking for the price sheet: see Offer buttons).
- Once per session: does not reappear on other pages or after it is closed
  (`sessionStorage`), and never again once a lead is sent (`localStorage`).
- Same hidden fields (`Project Name`, `lead_source` = BP MS Lead), posts to
  the same `/api/lead`, so it reaches Telegram and email like the form.
- Closes on X, Esc and a click outside; compact bottom sheet on phones.
- Script tag is `defer` and the modal is built only after `window` load, so
  PageSpeed stays 95+.

### Offer buttons and the price-sheet pop-up (every microsite, from 24 November 2026)

- Buttons ask for something specific instead of "Get In Touch": Download
  Brochure, Get Price Sheet, Get Floor Plans (Get Plot Sizes on a plots site)
  and Book a Site Visit, chosen by the section or page they sit on. Each
  carries `data-cta` (`brochure`, `price`, `floorplan`, `plots`, `visit`).
  Sites built by `build/generate.js` do the same with their `data-modal`
  intents (Cost sheet, Floor plan, Site visit).
- A click opens the pop-up form on the same page, with matching wording, and
  the lead's message says what was asked for ("Asked for the brochure through
  the website pop-up."), so it shows in Telegram, the email and the sheet's
  Remarks. The href stays as the path without the script. Menu and footer text
  links still go to the contact page.
- The timed pop-up opens after 5 seconds and asks for the price sheet.
- The copy never promises a document the project has not released: "the
  brochure, or the latest project details if the brochure is not out yet".
  The sales team sends what exists.
- Email is optional on every form and in the Worker; name and phone are
  required. A bare ten-digit number must start with 6 to 9 (bots send
  1000000000).
- Script tags carry a version (`?v=20261124`). Bump it whenever the script
  changes: some sites cache `/js/*` for 7 days or a year.
- Judge it by leads per site in the PNZ MS Leads sheet, before (7 October to
  24 November 2026) and after.

## Phase 3 · Content QA (step 5)

Review every page against the rules above:
- All links work (internal and the sibling-microsite links).
- All forms submit correctly (`node worker/test.mjs` passes).
- Every image alt names the project:
  `grep -oh '<img[^>]*>' site/*.html | grep -vic 'alt="[^"]*Sobha Hennur'` prints 0.
- RERA: a registered project shows its portal-checked number (and the portal
  address) and nothing else about RERA; an unregistered project has no RERA
  mention at all (`grep -rni rera site/` prints nothing).
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
raghuvalekar1515@gmail.com with Project Name and Source = BP MS Lead. The
pop-up must open within 5–10 s and its test submission must also reach
Telegram and email.

## Phase 8 · Tracking and inbound backlinks

15. Add the project to the tracker sheet under Bangalore or Hyderabad:
    https://docs.google.com/spreadsheets/d/1QP4yT0hh45JhuieE-co5nWX-7l0qvfShWyk3RglAQdE/edit
16. Add a backlink to this microsite from every previous microsite in the
    same city (Bangalore → every Bangalore microsite; Hyderabad → every
    Hyderabad microsite).
