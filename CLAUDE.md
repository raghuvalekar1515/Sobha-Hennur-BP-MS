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
  (apartment → apartment, villa → villa). No visible text under a picture
  says which project it shows or that it is an artistic impression (the user's
  rule from 26 November 2026); the alt text names the project shown.
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

### Freshness: page dates every 3 days (every microsite, from 26 November 2026)

The user's standing rule, the same practice homznspace and the developers'
own sites use to hold their positions:

- **A date on every page.** Under each H1:
  "Published 20 November 2026 · The details on this page are updated as on
  26 November 2026." Both dates are `<time datetime>` elements, and the same
  two dates are the `datePublished` and `dateModified` of the page's JSON-LD
  `WebPage` node and its `<lastmod>` in `sitemap.xml`; they must always match.
  `datePublished` is the day the page first went up and never moves.
  Every other "the details are as of <date>" on the site (FAQ answers,
  "Information as of", llms.txt) is a `<time … data-updated>` and moves with it.
- **Every 3 days** the updated date moves to that day and the sentence is
  reworded: a different frame on each page, rotating every time.
  `node tools/freshen.mjs` does all of it, and `.github/workflows/freshen.yml`
  runs it daily and acts once 3 days have passed (state in
  `tools/freshness.json`). Dates of facts ("as of June 2026", another
  project's date) are never touched. If this repo does not have them yet,
  copy `tools/freshen.mjs`, `tools/freshness.json` and
  `.github/workflows/freshen.yml` from the Sobha-Biopolis repo and adapt them
  (sites built by `build/generate.js` set the dates in the generator).
- **Right after each refresh, in Search Console:** URL Inspection → Request
  indexing for the home page (then the overview, FAQs, location and contact
  pages as the ~10-a-day limit allows), and Sitemaps → resubmit `sitemap.xml`.
  Google offers no API for requesting indexing on these pages, so this step is
  done by hand.
- **The first words of every page** are the project name linked to the home
  page: the intro paragraph under the H1 starts with
  `<a class="home-link" href="/"><Project></a>`.
- When possible, pair a refresh with a real change (a new FAQ, a corrected
  fact, a new page), so the new date reflects new content.
- A new page: give it a home link in its first paragraph, then run
  `node tools/freshen.mjs`, which adds its date line and schema dates.
  `node tools/freshen.mjs --check` must pass before every push.

## Phase 2b · Ranking and lead strategies (every microsite, from 27 November 2026)

What the sites that outrank us do, adopted as standing rules: competitor
microsites (sobhabiopolis.in ranked first for "Sobha Biopolis" within days of
going up), homznspace, the property portals and the builders' own websites.
Every fact on a new page still follows Phase 2: checked, no source
attribution, RERA only when registered, no em dashes in the copy.

### Speed: be first
- The day a project name is heard, register the domain (Phase 5) and publish
  a first version within 24 to 48 hours: home, overview, price, floor plan,
  location, contact. Submit it in Search Console the same day. Being indexed
  first counts: sobhabiopolis.in went up nine days before sobhabiopolis.net.
- Then add two or three pages a week from the page set below until it is
  complete, each with real facts.

### One page for each search (the page set)
Each page targets one "<Project> + topic" search: its own title, H1, the
project's own facts (600 words or more where the facts support it), six to
eight FAQs with FAQPage JSON-LD. Never pad: a page without real facts waits.
- Price; cost sheet and charges (GST, stamp duty, registration, parking,
  maintenance, one worked all-in example); floor plans with a section per
  BHK; master plan; specifications; amenities; gallery.
- Location; connectivity (metro lines and stations with km and status, rail,
  airport, ORR, commute times); a locality guide (PIN code, lakes, schools,
  offices, property rates); a road or corridor guide (prices, IT parks, metro,
  road works).
- Launch date; possession date; project status and latest news, updated at
  least monthly with the month in its title ("<Project> Status: Nov 2026
  Update").
- Brochure (a form-first page: "the brochure, or the latest project details
  if the brochure is not out yet"); investment (price per sq ft, rental
  demand, growth drivers, risks); review (our own honest pros and cons, never
  star ratings or Review/AggregateRating schema); about the builder; site
  visit and directions (site address, how to reach, what to check); FAQs
  (25 or more answers).
- Comparisons with nearby projects, best with our own sibling microsites
  ("<Project> vs <Sibling>"): competitors rarely have them.
- A RERA page only once the project is registered (Phase 2 RERA rule).

### On every page
- Title of 50 to 65 characters with numbers (starting price, BHK, acres or
  homes, location): "<Project> Price | 1, 2, 3 & 4 BHK from ₹1.28 Cr". Meta
  description of 140 to 160 characters with the same hard numbers.
- H1 "<Project> <Topic>"; H2s carry the project name where it reads
  naturally; FAQ questions written as people search ("What is the possession
  date of <Project>?").
- Under the H1, the date line; the intro starts with the project name linked
  to the home page (Freshness).
- Before the footer: a related-pages block (four to eight links with a line
  each) and the unit-type price table with a Get Price Sheet button on every
  row (`data-cta="price"`).
- Breadcrumbs, visible and as BreadcrumbList JSON-LD; WebPage (Article for
  guide pages) with datePublished and dateModified; FAQPage.
- Images: project-named files and alt text; no caption under a picture naming
  another project (Phase 2).
- The home page links to every page (a guide grid with a picture per page).

### Facts that win answers (Google, its AI answers, ChatGPT, the portals)
- Carpet and super built-up area of every unit type, price per sq ft and the
  starting price of every type.
- Land, homes, towers or wings, floors and height, phases with homes per
  phase, open space, clubhouse size.
- Full address with PIN code; metro stations (line, status, km), rail,
  airports; ten or more schools, offices and hospitals with km; malls, lakes.
- Launch and possession dates, and RERA only when registered.
- All of them in a facts table near the top of the home and overview pages,
  in llms.txt and llms-full.txt, and in the JSON-LD `additionalProperty`.

### Links between our sites
- Zone hub pages on our strongest domains (e.g. sobhamullur.in): "New launch
  projects on <road> <year>", a paragraph and a link for every sibling there.
- From older, stronger sites, link new launches inside body text with the
  project name as the link text, not only in the FAQ list.
- Keep links relevant (same city, ideally the same zone). No footer blocks
  linking every site to every other site.

### Leads
- Forms: name and phone required, email optional (Phase 2); optional one-tap
  BHK and budget choices.
- Record where each lead came from: the landing page (done), the referrer,
  UTM tags and gclid, into the sheet's Remarks.
- Price page: an EMI and all-in cost calculator whose "send me this
  breakdown" is the lead form.
- Thank-you state: a WhatsApp link for the brochure, a site-visit slot picker,
  and two or three sibling projects in the same zone.
- Site visits booked by date and time slot, weekends included. Offer a pickup
  only if the sales team provides one.
- An NRI block on the home and contact pages: WhatsApp or video-call tours,
  call times in their time zone.
- Call and WhatsApp buttons in the header, the mobile bar and the thank-you
  state, once the user gives the sales number (pending).
- Leads called back within minutes of the Telegram alert; a callback time is
  promised on the form only if the team can keep it.

### Indexing and measurement
- Search Console verified for every site (Phase 6); Bing Webmaster Tools
  (import the sites from Search Console); Cloudflare Crawler Hints on, so
  Bing and others hear of changes through IndexNow.
- Cloudflare Web Analytics on every site (pending the user's OK).
- Every week, per site: Search Console queries at positions 4 to 15, improve
  those pages first; leads per site from the PNZ MS Leads sheet.
- Each Worker deploys from the repo's default branch (Workers → Settings →
  Builds). A site whose Worker builds from another branch misses every change.

### Never copy from competitors
- RERA pages or "registration awaited" wording for unregistered projects.
- Fake reviews, star ratings or Review schema.
- Another project's picture called "<Project> photo" with no project named in
  its alt text.
- The same text on several of our sites with only the name swapped (Google's
  scaled-content policy demotes all of them); every page needs the project's
  own facts.
- Required email or a consent checkbox on the forms.

## Phase 3 · Content QA (step 5)

Review every page against the rules above:
- All links work (internal and the sibling-microsite links).
- All forms submit correctly (`node worker/test.mjs` passes).
- Dates agree: `node tools/freshen.mjs --check` passes (visible date, JSON-LD
  and sitemap the same on every page, and every page opens with the home link).
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
