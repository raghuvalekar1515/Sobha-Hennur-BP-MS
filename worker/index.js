/**
 * Lead capture for the Sobha Hennur microsite.
 *
 * The site is otherwise pure static assets - a Webflow export, served
 * untouched. This Worker exists only to catch POST /api/lead and durably
 * record it, because a lost enquiry on a project of this value is expensive
 * and silent.
 *
 * Every other request falls through to the static assets binding.
 *
 * Each lead also carries a `lead_source`, taken from a hidden field in the
 * form markup, so enquiries from different campaigns are told apart in the
 * Telegram message, the email and the stored record. It is optional: a form
 * without the field submits exactly as before.
 *
 * Leads land in the LEADS KV namespace under `lead:<iso timestamp>:<id>`.
 * KV lists keys in lexicographic order, so an ISO prefix means the dashboard
 * shows them oldest to newest with no extra tooling. Read them at
 * Cloudflare dashboard -> Storage & Databases -> KV -> leads.
 *
 * A copy is sent onward: by email when LEAD_EMAIL_TO is set and either the
 * Cloudflare send binding or a Resend key is available, and to Telegram: the
 * main bot (TELEGRAM_BOT_TOKEN) posts to this project's zone group and the
 * two All Bangalore groups, and a _2 or _3 bot to its own TELEGRAM_CHAT_IDS.
 * A third copy goes to the shared "PNZ MS Leads" Google Sheet, through the
 * LEAD_SHEET service binding to the assetz-mizu-ki Worker.
 * Each channel is independent and entirely optional; unset, it is skipped.
 * All of it runs after the lead is already in KV, so an outage, a revoked key
 * or a wrong address cannot cost an enquiry.
 *
 * GET /api/lead/status reports which channels are switched on, as booleans
 * only, for diagnosing a misconfiguration without shell access.
 *
 * There is deliberately NO endpoint to read leads back. An unauthenticated
 * one would publish every enquirer's name, email and phone number.
 */
"use strict";

/* A lead is a handful of short strings. Anything larger is not a lead. */
const MAX_BODY_BYTES = 4096;

/* Field length caps, applied after trimming. The Webflow textarea caps the
   message at 5000, but a lead that long is a paste, not an enquiry. */
const LIMITS = { name: 80, email: 120, message: 2000, page: 200, project: 120, lead_source: 120, zone: 60 };

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

function clean(value, max) {
  if (typeof value !== "string") return "";
  /* Strip control characters so a stored lead cannot corrupt a log or a CSV. */
  return value.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, max);
}

/**
 * Accepts what people actually type: spaces, dashes, a +91 or 0 prefix.
 * Returns the bare 10 digit number when it reads as an Indian mobile, and
 * otherwise the raw digits, which validate() then judges on length.
 */
function normalisePhone(value) {
  const digits = clean(value, 40).replace(/\D/g, "");
  const local = digits.replace(/^(?:0|91)/, "");
  return local.length === 10 ? local : digits;
}

/**
 * Mirrors the browser-side validation. The client checks are for feedback;
 * these decide what gets stored.
 *
 * All four fields are required here because all four carry `required` in the
 * Webflow markup - server-side rules that are looser than the form's would
 * store leads the visitor was never allowed to submit.
 *
 * Phone is deliberately more permissive than the Indian-mobile rule used on
 * Trump Towers. This form is `type="tel"` with no pattern, so a visitor
 * abroad - a substantial share of enquiries for Bengaluru property - can and
 * will type a country code that browser validation accepts. Rejecting it
 * server-side would lose exactly the leads worth most. An Indian mobile is
 * still normalised to ten digits; anything else is kept if it is a plausible
 * E.164 length.
 */
function validate(input) {
  const lead = {
    name: clean(input.name, LIMITS.name),
    email: clean(input.email, LIMITS.email),
    phone: normalisePhone(input.phone),
    message: clean(input.message, LIMITS.message),
    page: clean(input.page, LIMITS.page),
    project: clean(input.project, LIMITS.project),
    /* Campaign attribution from the form's hidden lead_source field. Optional:
       an older cached page, or a form that does not declare it, still submits.
       Never validated against - a missing hidden field must not cost a real
       enquiry - but cleaned and capped like every other caller-supplied string. */
    lead_source: clean(input.lead_source, LIMITS.lead_source),
    /* The project's zone, from the form's hidden Zone field. A page cached
       before the field existed sends none, so the site's own zone stands in
       and every lead still says which zone it belongs to. */
    zone: clean(input.zone, LIMITS.zone) || SHEET_PROJECT.zone
  };
  if (lead.name.length < 2) return { error: "Please enter your name." };
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(lead.email)) return { error: "Please check the email address." };
  const indianMobile = /^[6-9][0-9]{9}$/.test(lead.phone);
  const plausibleInternational = /^[0-9]{8,15}$/.test(lead.phone);
  if (!indianMobile && !plausibleInternational) {
    return { error: "Please enter a valid phone number." };
  }
  if (lead.message.length < 2) return { error: "Please enter a message." };
  return { lead };
}

/**
 * Uses the platform rate limiting binding rather than a counter in KV.
 * KV is eventually consistent and caches reads, so read-modify-write is the
 * documented anti-pattern for it: a concurrent burst can read the same stale
 * value and admit more than the cap.
 */
async function rateLimited(env, ip) {
  if (!ip) return false;
  if (!env.LEAD_RATE_LIMIT) {
    /* Never drop a real enquiry because the limiter is missing; spam is the
       lesser cost. Loud enough to catch in `wrangler tail`. */
    console.error("LEAD_RATE_LIMIT binding missing; admitting submission unlimited");
    return false;
  }
  const { success } = await env.LEAD_RATE_LIMIT.limit({ key: ip });
  return !success;
}

/* Telegram rejects messages over 4096 characters. */
const TELEGRAM_MAX = 3500;

/**
 * Plain text on purpose. Telegram's HTML and Markdown parse modes reject a
 * whole message when user supplied text contains a stray "<" or "_", which
 * would silently drop exactly the leads with unusual names.
 */
function formatLead(record) {
  const lines = [
    "New enquiry - " + (record.project || "website"),
    "",
    "Name:    " + record.name,
    "Phone:   " + record.phone,
    "Email:   " + record.email,
    "",
    "Message: " + record.message,
    "",
    "Page:    " + (record.page || "/"),
    "Project: " + (record.project || "website"),
    record.zone ? "Zone:    " + record.zone : "",
    record.lead_source ? "Source:  " + record.lead_source : "",
    "Time:    " + record.received,
    record.country ? "Country: " + record.country : ""
  ];
  return lines.filter(Boolean).join("\n").slice(0, TELEGRAM_MAX);
}

/* The Bangalore zone groups every microsite's main bot posts to, keyed by the
   project's zone, plus the two groups that receive every Bangalore lead. The
   same ids as the other Bangalore microsites; a chat id is not a secret, the
   bot token that can post to it is. */
const TELEGRAM_ZONE_CHATS = {
  "North Bangalore": "-5141074270",
  "South Bangalore": "-5339561948",
  "East Bangalore": "-5157783892",
  "West Bangalore": "-5494009393" /* Central & West */
};
const TELEGRAM_ALL_BANGALORE_CHATS = ["-5486402123", "-5268923231"];

function zoneChats() {
  return [TELEGRAM_ZONE_CHATS[SHEET_PROJECT.zone], ...TELEGRAM_ALL_BANGALORE_CHATS].filter(Boolean);
}

/* Each further bot is an independent token with its own chat list, because a
   chat id is only addressable by a bot that the chat has actually started. */
const BOT_SUFFIXES = ["", "_2", "_3"];

/**
 * Reads every configured bot from the environment. The main bot needs only
 * its token and posts to this project's zone groups; a _2 or _3 bot needs both
 * a token and at least one chat id to count as configured. A half-set pair is
 * skipped rather than silently sending nowhere.
 */
function telegramTargets(env) {
  const targets = [];
  for (const suffix of BOT_SUFFIXES) {
    const token = env[`TELEGRAM_BOT_TOKEN${suffix}`];
    const chats = suffix
      ? String(env[`TELEGRAM_CHAT_IDS${suffix}`] || "").split(",").map((c) => c.trim()).filter(Boolean)
      : (token ? zoneChats() : []);
    if (token && chats.length) targets.push({ suffix: suffix || "_1", token, chats });
    else if (token || chats.length) {
      console.error(`telegram config incomplete for TELEGRAM_*${suffix || ""}; needs both token and chat ids`);
    }
  }
  return targets;
}

/**
 * Fans the lead out to every chat of every configured bot. Each send is
 * independent, so one bad token or one chat that has not started the bot
 * cannot stop delivery anywhere else. Never throws.
 */
async function notifyTelegram(env, record) {
  const targets = telegramTargets(env);
  if (!targets.length) {
    console.log("telegram not configured; lead stored without notification");
    return;
  }

  const text = formatLead(record);
  const sends = [];
  for (const { suffix, token, chats } of targets) {
    for (const chat_id of chats) {
      sends.push((async () => {
        let sent = await telegramCall(token, "sendMessage", { chat_id, text, disable_web_page_preview: true });
        /* A group upgraded to a supergroup gets a new id; follow it once so
           the lead still lands, and log it so the map above gets updated. */
        if (!sent.ok && sent.migrateTo) {
          console.error(`telegram chat=${chat_id} is now chat=${sent.migrateTo}; update TELEGRAM_ZONE_CHATS`);
          sent = await telegramCall(token, "sendMessage", { chat_id: sent.migrateTo, text, disable_web_page_preview: true });
        }
        if (!sent.ok) {
          /* description names the real cause: bad token, chat not started,
             kicked. The token itself is never logged. */
          console.error(`telegram send failed bot=${suffix} chat=${chat_id} status=${sent.status} ${sent.description}`);
          return;
        }
        console.log(`telegram sent bot=${suffix} chat=${chat_id}`);
      })());
    }
  }
  await Promise.all(sends);
}

/**
 * One Bot API call. Never throws: a network error or timeout comes back as
 * { ok: false } with the reason in description.
 */
async function telegramCall(token, method, payload) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      /* A hung Telegram call must not hold the invocation open. */
      signal: AbortSignal.timeout(5000)
    });
    const body = await res.json().catch(() => ({}));
    const migrated = body.parameters && body.parameters.migrate_to_chat_id;
    return {
      ok: res.ok && body.ok !== false,
      status: res.status,
      description: String(body.description || (res.ok ? "" : `HTTP ${res.status}`)).slice(0, 200),
      result: body.result,
      migrateTo: migrated ? String(migrated) : ""
    };
  } catch (err) {
    return { ok: false, status: 0, description: String((err && err.message) || err).slice(0, 200), result: undefined, migrateTo: "" };
  }
}

/* Names a chat in the self-check without printing its id. */
function chatLabel(suffix, chat, i) {
  const first = suffix === "_1";
  if (first && chat === TELEGRAM_ZONE_CHATS[SHEET_PROJECT.zone]) return `${SHEET_PROJECT.zone} group`;
  const common = first ? TELEGRAM_ALL_BANGALORE_CHATS.indexOf(chat) : -1;
  return common >= 0 ? `All Bangalore group ${common + 1}` : `chat ${i + 1}`;
}

/**
 * Whether the bot could post in a chat right now, read with getChat and
 * getChatMember so nothing is sent to the group.
 */
async function canPost(token, botId, chat_id) {
  const [chat, member] = await Promise.all([
    telegramCall(token, "getChat", { chat_id }),
    telegramCall(token, "getChatMember", { chat_id, user_id: botId })
  ]);
  if (!chat.ok) return { report: { ok: false, error: chat.description }, migrateTo: chat.migrateTo || member.migrateTo };
  const type = (chat.result && chat.result.type) || "";
  if (!member.ok) return { report: { ok: false, type, error: member.description }, migrateTo: member.migrateTo };
  const m = member.result || {};
  const perms = (chat.result && chat.result.permissions) || {};
  let ok = false, error = "";
  if (m.status === "creator" || m.status === "administrator") ok = true;
  else if (m.status === "member") {
    ok = perms.can_send_messages !== false;
    if (!ok) error = "members may not send messages in this group";
  } else if (m.status === "restricted") {
    ok = m.is_member !== false && m.can_send_messages !== false;
    if (!ok) error = "the bot is restricted from sending messages here";
  } else error = m.status === "kicked" ? "the bot was removed from this group" : "the bot is not a member of this group";
  const report = { ok, type, membership: m.status || "" };
  if (error) report.error = error;
  return { report, migrateTo: "" };
}

/**
 * GET /api/lead/status?check=telegram: for every configured bot, whether its
 * token works and whether it can post in each of its chats. Bot usernames and
 * chat labels only; no token or chat id is returned. Rate limited, because
 * each check makes several Bot API calls.
 */
async function telegramCheck(request, env) {
  const ip = request.headers.get("cf-connecting-ip") || "";
  if (ip && await rateLimited(env, `telegram-check:${ip}`)) {
    return json(429, { ok: false, error: "Too many checks. Please try again in a minute." });
  }
  const bots = await Promise.all(telegramTargets(env).map(async ({ suffix, token, chats }) => {
    const bot = { bot: `TELEGRAM_BOT_TOKEN${suffix === "_1" ? "" : suffix}` };
    const me = await telegramCall(token, "getMe", {});
    if (!me.ok || !me.result) return Object.assign(bot, { ok: false, error: me.description || "getMe failed", chats: [] });
    bot.username = me.result.username ? `@${me.result.username}` : "";
    bot.chats = await Promise.all(chats.map(async (chat, i) => {
      const entry = { chat: chatLabel(suffix, chat, i) };
      const first = await canPost(token, me.result.id, chat);
      if (!first.migrateTo) return Object.assign(entry, first.report);
      const moved = await canPost(token, me.result.id, first.migrateTo);
      return Object.assign(entry, moved.report, { upgradedTo: first.migrateTo });
    }));
    bot.ok = bot.chats.every((c) => c.ok);
    return bot;
  }));
  const delivering = bots.length > 0 && bots.every((b) => b.ok);
  console.log(`telegram self-check bots=${bots.length} delivering=${delivering}`);
  return json(200, { ok: true, telegram: { configured: bots.length > 0, delivering, bots } });
}

/**
 * Sends through Cloudflare Email Service. Preferred over a third party
 * because it needs no external account and no API key: mail to an address
 * already verified as an Email Routing destination is free on every plan and
 * counts against no quota.
 *
 * The sender must be on a domain onboarded to Email Service; the recipient
 * must be a verified destination address. Both fail loudly rather than
 * silently if not.
 */
async function sendViaBinding(env, to, subject, text) {
  const from = env.LEAD_EMAIL_FROM;
  if (!from) {
    console.error("LEAD_EMAIL binding present but LEAD_EMAIL_FROM is unset; cannot choose a sender");
    return;
  }
  for (const address of to) {
    try {
      const res = await env.LEAD_EMAIL.send({ to: address, from, subject, text });
      console.log(`email sent via cloudflare to=${address} id=${res && res.messageId}`);
    } catch (err) {
      /* Names the real cause: address not verified, sender domain not
         onboarded, binding restricted to another destination. */
      console.error(`email send failed via cloudflare to=${address} ${err && err.message}`);
    }
  }
}

/**
 * Resend fallback, kept so the channel still works on an account without
 * Email Routing. The API key is never logged.
 */
async function sendViaResend(env, to, subject, text, record) {
  const body = {
    from: env.RESEND_FROM || "Website leads <onboarding@resend.dev>",
    to,
    subject,
    text
  };
  /* Lets a reply go straight back to the enquirer. */
  if (record.email) body.reply_to = record.email;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`email send failed via resend status=${res.status} ${detail.slice(0, 200)}`);
      return;
    }
    console.log(`email sent via resend to ${to.length} recipient(s)`);
  } catch (err) {
    console.error(`email send threw via resend ${err && err.message}`);
  }
}

/**
 * Best effort on the same terms as Telegram: runs after the lead is in KV and
 * its failure is invisible to the visitor.
 */
async function notifyEmail(env, record) {
  const to = String(env.LEAD_EMAIL_TO || "").split(",").map((a) => a.trim()).filter(Boolean);
  if (!to.length) {
    console.log("email not configured; no recipient set");
    return;
  }
  const subject = `New enquiry: ${record.name} - ${record.project || "website"}`;
  const text = formatLead(record);

  if (env.LEAD_EMAIL) return sendViaBinding(env, to, subject, text);
  if (env.RESEND_API_KEY) return sendViaResend(env, to, subject, text, record);
  console.log("email not configured; neither the send binding nor a Resend key is available");
}

/**
 * Reports which notification channels are configured, so a misconfiguration
 * can be diagnosed from a browser instead of needing `wrangler tail`.
 *
 * Booleans and counts only. No token, address, chat id or lead data is ever
 * returned, so this exposes nothing an attacker can use: it says whether
 * alerting is switched on, not who it reaches.
 */
function statusReport(env) {
  const emailTo = String(env.LEAD_EMAIL_TO || "").split(",").map((a) => a.trim()).filter(Boolean);
  const bots = telegramTargets(env);
  return json(200, {
    ok: true,
    storage: Boolean(env.LEADS),
    rateLimiter: Boolean(env.LEAD_RATE_LIMIT),
    email: {
      configured: emailTo.length > 0 && (Boolean(env.LEAD_EMAIL) || Boolean(env.RESEND_API_KEY)),
      transport: env.LEAD_EMAIL ? "cloudflare" : (env.RESEND_API_KEY ? "resend" : "none"),
      recipientsSet: emailTo.length,
      senderSet: Boolean(env.LEAD_EMAIL_FROM)
    },
    telegram: {
      configured: bots.length > 0,
      bots: bots.length,
      chats: bots.reduce((n, b) => n + b.chats.length, 0)
    },
    sheet: {
      configured: Boolean(env.LEAD_SHEET)
    }
  });
}

/**
 * Cloudflare's two-letter code ("IN") as the name a person reads in a
 * spreadsheet ("India"). Cloudflare also sends pseudo-codes that are not
 * regions, such as T1 for Tor; those are kept as they are.
 */
function countryName(code) {
  if (!code) return "";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code;
  } catch (err) {
    return code;
  }
}

/**
 * What every sheet row from this site says about the project, whatever page
 * or form the lead came from: one sheet collects every microsite, and these
 * are what it sorts and filters projects by. City is the project's city; the
 * visitor's goes in Lead City. From the site's own description of the project.
 */
const SHEET_PROJECT = {
  name: "Sobha Hennur",
  city: "Bangalore",
  /* One of the shared sheet's zone tabs (North, South, East, Central & West
     Bangalore) and a key of TELEGRAM_ZONE_CHATS, so the row is copied to the
     North tab and the lead reaches the North group. Hennur Road is North, as
     on the Assetz Mizu Ki, CKPC Hennur Road and earlier Sobha Hennur sites. */
  zone: "North Bangalore",
  status: "Pre Launch",
  type: "1, 2, 3 & 4 BHK Apartments",
  location: "Hennur Road"
};

/**
 * The row the shared "PNZ MS Leads" Google Sheet receives, in the same shape
 * the assetz-mizu-ki Worker builds for its own leads; that Worker maps it
 * onto the sheet's headers (Date, Source, Time, City, Project Name, Customer
 * Name, Contact No, Email Id, Project Zone, Project Status, Project Type,
 * Project Location, Page URL, Lead City). Page is the full URL, not
 * the path the notifications print: one sheet collects every microsite, and
 * the domain is what says which. Where the form also sends an intent or a
 * preferred time, the message field carries them too.
 */
function sheetRow(record, origin) {
  const path = record.page || "/";
  const message = [
    record.intent,
    record.message,
    record.time ? "Preferred time: " + record.time : ""
  ].filter(Boolean).join(". ");
  return {
    name: record.name,
    phone: record.phone,
    email: record.email || "",
    message,
    page: origin + (path.startsWith("/") ? path : "/" + path),
    source: record.lead_source || "",
    time: record.received || record.receivedAt,
    country: countryName(record.country),
    leadCity: record.city || "",
    project: SHEET_PROJECT.name,
    city: SHEET_PROJECT.city,
    projectZone: SHEET_PROJECT.zone,
    projectStatus: SHEET_PROJECT.status,
    projectType: SHEET_PROJECT.type,
    projectLocation: SHEET_PROJECT.location
  };
}

/**
 * Adds the lead to the shared "PNZ MS Leads" Google Sheet, through LEAD_SHEET:
 * a service binding (wrangler.jsonc) to the LeadSheet entrypoint of the
 * assetz-mizu-ki Worker in this same Cloudflare account. That Worker holds the
 * Apps Script URL and secret and writes the row, so this site needs neither,
 * and no dashboard variable. A named entrypoint is reachable only through a
 * binding from inside the account.
 *
 * Best effort on the same terms as Telegram and email. Never throws.
 */
async function notifySheet(env, record, origin) {
  if (!env.LEAD_SHEET) {
    console.log("google sheet not configured; lead stored without a sheet row");
    return;
  }
  try {
    const result = await env.LEAD_SHEET.append(sheetRow(record, origin));
    if (result && result.ok) console.log(`google sheet row appended row=${result.row}`);
    else console.error(`google sheet append failed ${(result && result.error) || "no result"}`);
  } catch (err) {
    /* assetz-mizu-ki missing, renamed, or not yet exporting LeadSheet. */
    console.error(`google sheet append threw ${err && err.message}`);
  }
}

async function handleLead(request, env, ctx) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: { allow: "POST" } });
  }

  /* Without a namespace bound there is nowhere to put the lead. Say so loudly
     rather than returning 200 and dropping it, which is the failure this
     endpoint was built to end. */
  if (!env.LEADS) {
    console.error("LEADS KV namespace is not bound; lead rejected rather than silently dropped");
    return json(503, { ok: false, error: "Lead storage is not configured." });
  }

  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) return json(413, { ok: false, error: "Payload too large." });

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { ok: false, error: "Payload too large." });

  let input;
  try {
    input = JSON.parse(raw);
  } catch (err) {
    return json(400, { ok: false, error: "Malformed request." });
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return json(400, { ok: false, error: "Malformed request." });
  }

  /* Honeypot. A bot fills every field it finds, a person never sees this one.
     Answer 200 so the bot records a success and does not retry or adapt. */
  if (clean(input.company, 100)) return json(200, { ok: true });

  const checked = validate(input);
  if (checked.error) return json(422, { ok: false, error: checked.error });

  const ip = request.headers.get("cf-connecting-ip") || "";
  if (await rateLimited(env, ip)) {
    return json(429, { ok: false, error: "Too many submissions. Please try again later." });
  }

  const received = new Date().toISOString();
  const record = Object.assign({ received }, checked.lead, {
    /* Country and user agent help spot junk. The IP is used for rate limiting
       above but deliberately not stored alongside the enquirer's details. */
    country: (request.cf && request.cf.country) || "",
    /* The visitor's city, for the sheet's Lead City column. */
    city: (request.cf && request.cf.city) || "",
    userAgent: clean(request.headers.get("user-agent") || "", 200)
  });

  const id = crypto.randomUUID().slice(0, 8);
  await env.LEADS.put(`lead:${received}:${id}`, JSON.stringify(record, null, 2));

  /* Surfaces in `wrangler tail` so a live submission can be watched. */
  console.log(`lead stored ${received} ${id} page=${record.page}`);

  /* Deliberately after the KV write and deliberately not awaited: the lead is
     already safe, so the visitor should not wait on Telegram and must not see
     an error if it fails. waitUntil keeps the invocation alive to finish. */
  const notifying = Promise.all([
    notifyTelegram(env, record),
    notifyEmail(env, record),
    notifySheet(env, record, new URL(request.url).origin)
  ]);
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(notifying);
  else await notifying;

  return json(200, { ok: true });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/lead/status") {
      return url.searchParams.get("check") === "telegram" ? telegramCheck(request, env) : statusReport(env);
    }
    if (url.pathname === "/api/lead") return handleLead(request, env, ctx);
    return env.ASSETS.fetch(request);
  }
};
