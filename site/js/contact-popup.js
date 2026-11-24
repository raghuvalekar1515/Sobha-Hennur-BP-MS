/*
 * Contact pop-up: an enquiry form that opens by itself 5 seconds after the
 * visitor lands, once per browser session.
 *
 * The design follows the enquiry dialog on the DSR Ciel and Sri Tirumala
 * Legacy sites: a native <dialog> with a white card, the title and a close
 * button on one row, name, phone and email, and one primary button. The
 * button carries the classes of this site's contact form button, so it
 * matches the page.
 *
 * It opens once per session: after it has opened, it does not open again on
 * another page or after the visitor closes it (sessionStorage), and:
 *   - never again once this browser has sent a lead, from the pop-up or the
 *     page's own form (form-handler.js sets the same localStorage flag),
 *   - not over another open dialog (the menu drawer, for one), and
 *   - not while the visitor is typing into a form on the page; it waits
 *     until they stop.
 *
 * Submissions go to the same POST /api/lead as the page's contact form, with
 * the same fields form-handler.js sends. The Worker requires a message, so a
 * fixed one is sent that also says where the lead came from. The form
 * carries the same hidden fields as the page's: Project Name, Zone and
 * lead_source (BP MS Lead).
 *
 * Closes on the X button, the Esc key or a click outside. On a phone it is a
 * compact sheet at the foot of the screen, not a full-screen cover.
 *
 * Nothing is built until the page has finished loading (window load), and the
 * <script> tag is deferred, so the pop-up never competes with the page itself.
 *
 * The form is not inside a data-lead-form wrapper, so form-handler.js leaves
 * it to this file.
 */
(function () {
  'use strict';

  var ENDPOINT = '/api/lead';
  var PROJECT = "Sobha Hennur";
  var ZONE = "North Bangalore";
  var LEAD_SOURCE = "BP MS Lead";
  var MESSAGE = 'Asked for a call back through the website pop-up.';
  /* What each button asks for (data-cta on the page). The timed opening asks
     for the price sheet. The lead's message says which, so the sales team
     sees it in Telegram, the email and the sheet's Remarks column. The copy
     never promises a document the project has not released. */
  var OFFERS = {
    price: {
      title: PROJECT + ' price sheet',
      lede: 'Leave your name and number and we will send you the latest price sheet, or the latest pricing details if the official list is not out yet.',
      button: 'Send me the price sheet',
      message: 'Asked for the price sheet through the website pop-up.'
    },
    brochure: {
      title: PROJECT + ' brochure',
      lede: 'Leave your name and number and we will send you the brochure, or the latest project details if the brochure is not out yet.',
      button: 'Send me the brochure',
      message: 'Asked for the brochure through the website pop-up.'
    },
    floorplan: {
      title: PROJECT + ' floor plans',
      lede: 'Leave your name and number and we will send you the floor plans and unit sizes, or the latest details if the plans are not out yet.',
      button: 'Send me the floor plans',
      message: 'Asked for the floor plans through the website pop-up.'
    },
    plots: {
      title: PROJECT + ' plot sizes',
      lede: 'Leave your name and number and we will send you the plot sizes and layout, or the latest details if they are not out yet.',
      button: 'Send me the plot sizes',
      message: 'Asked for the plot sizes through the website pop-up.'
    },
    visit: {
      title: 'Book a site visit',
      lede: 'Leave your name and number and we will call you to fix a day and time that suits you.',
      button: 'Request a site visit',
      message: 'Asked for a site visit through the website pop-up.'
    },
    enquire: {
      title: 'Enquire about ' + PROJECT,
      lede: 'Leave your name and number and we will call you back with the details you need.',
      button: 'Send my request',
      message: MESSAGE
    }
  };
  var LEDE_CSS = '.cpop_lede{margin:0 0 .9rem;font-size:.95rem;line-height:1.45;opacity:.85}' +
    '@media (max-width:479px){.cpop_lede{font-size:.85rem;margin-bottom:.6rem}}';
  /* Same-origin links to the contact page that look like buttons open the pop-up instead. */
  var CONTACT_PATH = /^\/contact-us(\.html)?\/?$/;
  /* The checklist allows 5 to 10 seconds. */
  var DELAY_MS = 5000;
  /* While the visitor is typing elsewhere, look again this often. */
  var RETRY_MS = 3000;
  var SENT_KEY = 'contact_popup_sent';
  /* Once shown, not again this session: on another page or after closing. */
  var SHOWN_KEY = 'contact_popup_shown';
  /* The classes on this site's contact form button, so the pop-up's matches. */
  var BUTTON_CLASS = "button btn-solid theme-primary";

  var CSS =
    '.cpop{border:0;border-radius:10px;padding:0;margin:auto;width:min(94vw,460px);max-height:calc(100% - 2rem);' +
      'overflow:auto;background:#fff;color:#1a1a1a;box-shadow:0 24px 60px rgba(8,16,30,.28)}' +
    '.cpop::backdrop{background:rgba(8,16,30,.55)}' +
    '.cpop_head{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;padding:1.1rem 1.1rem .6rem}' +
    '.cpop_title{font-size:1.2rem;line-height:1.3;margin:0;padding-top:.6rem;color:inherit}' +
    '.cpop_close{flex:none;background:none;border:0;font-size:1.5rem;line-height:1;cursor:pointer;' +
      'min-width:44px;min-height:44px;color:#5c5c5c}' +
    '.cpop_body{padding:0 1.1rem 1.2rem}' +
    '.cpop_field{margin-bottom:.9rem}' +
    '.cpop label{display:block;font-size:.85rem;font-weight:600;letter-spacing:0;margin-bottom:.3rem;color:inherit}' +
    '.cpop input{display:block;width:100%;box-sizing:border-box;font-family:inherit;font-size:16px;' +
      'padding:.7rem .8rem;border:1px solid #d6d6d6;border-radius:10px;background:#fff;color:#1a1a1a;' +
      'min-height:46px;margin:0}' +
    '.cpop input:invalid[data-touched="true"]{border-color:#b3261e}' +
    '.cpop_hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}' +
    '.cpop_status{color:#b3261e;font-size:.8rem;margin:.3rem 0 .6rem;min-height:1em}' +
    '.cpop .cpop_button{border-radius:10px;min-height:46px;cursor:pointer;font-family:inherit}' +
    '.cpop .cpop_button:disabled{opacity:.7;cursor:wait}' +
    '.cpop_done{padding:.2rem 0 .4rem}' +
    '.cpop_done p{margin:0 0 1rem}' +
    /* Phones: a compact sheet at the foot of the screen, so the page stays visible. */
    '@media (max-width:479px){' +
      '.cpop{margin:auto 0 0;width:100%;max-width:100%;border-radius:14px 14px 0 0;max-height:80%}' +
      '.cpop_head{padding:.75rem .9rem .3rem}' +
      '.cpop_title{font-size:1.05rem;padding-top:.45rem}' +
      '.cpop_body{padding:0 .9rem .9rem}' +
      '.cpop_field{margin-bottom:.55rem}' +
      '.cpop label{font-size:.8rem;margin-bottom:.2rem}' +
      '.cpop input{min-height:42px;padding:.5rem .7rem}' +
      '.cpop_status{margin:.2rem 0 .4rem}' +
    '}';

  var HTML =
    '<div class="cpop_head">' +
      '<h2 class="cpop_title" id="cpop-title"></h2>' +
      '<button class="cpop_close" type="button" data-cpop-close aria-label="Close">&times;</button>' +
    '</div>' +
    '<div class="cpop_body">' +
      '<p class="cpop_lede"></p>' +
      '<form class="cpop_form" novalidate>' +
        '<input type="hidden" name="Project Name">' +
        '<input type="hidden" name="Zone">' +
        '<input type="hidden" name="lead_source">' +
        '<div class="cpop_field"><label for="cpop-name">Your name</label>' +
          '<input id="cpop-name" name="name" type="text" autocomplete="name" required minlength="2" maxlength="80"></div>' +
        '<div class="cpop_field"><label for="cpop-phone">Phone number</label>' +
          '<input id="cpop-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" required maxlength="16" placeholder="10 digit mobile number"></div>' +
        '<div class="cpop_field"><label for="cpop-email">Email (optional)</label>' +
          '<input id="cpop-email" name="email" type="email" autocomplete="email" maxlength="120"></div>' +
        '<div class="cpop_hp" aria-hidden="true"><label for="cpop-company">Company</label>' +
          '<input id="cpop-company" name="company" type="text" tabindex="-1" autocomplete="off"></div>' +
        '<p class="cpop_status" role="status" aria-live="polite"></p>' +
        '<button type="submit" class="' + BUTTON_CLASS + ' cpop_button">Send my request</button>' +
      '</form>' +
      '<div class="cpop_done" hidden>' +
        '<p>Thank you. We have your details and will call you shortly.</p>' +
        '<button type="button" class="' + BUTTON_CLASS + ' cpop_button" data-cpop-close>Close</button>' +
      '</div>' +
    '</div>';

  var FALLBACK = 'That did not go through. Please try again in a moment.';

  var dialog, form, status, done, lastFocus, timer, current;

  function sent() {
    try { return window.localStorage.getItem(SENT_KEY) === '1'; } catch (e) { return false; }
  }

  function remember() {
    try { window.localStorage.setItem(SENT_KEY, '1'); } catch (e) { /* private mode */ }
  }

  function shown() {
    try { return window.sessionStorage.getItem(SHOWN_KEY) === '1'; } catch (e) { return false; }
  }

  function markShown() {
    try { window.sessionStorage.setItem(SHOWN_KEY, '1'); } catch (e) { /* private mode */ }
  }

  function build() {
    /* Attribute the lead the way this page's own form does, where it has one. */
    var pageSource = document.querySelector('form input[name="lead_source"]');
    var pageProject = document.querySelector('form input[name="Project Name"]');
    var pageZone = document.querySelector('form input[name="Zone"]');

    var style = document.createElement('style');
    style.textContent = CSS + LEDE_CSS;
    document.head.appendChild(style);

    dialog = document.createElement('dialog');
    dialog.className = 'cpop';
    dialog.setAttribute('aria-labelledby', 'cpop-title');
    dialog.innerHTML = HTML;
    dialog.querySelector('.cpop_title').textContent = 'Enquire about ' + PROJECT;
    dialog.querySelector('[name="lead_source"]').value = (pageSource && pageSource.value) || LEAD_SOURCE;
    dialog.querySelector('[name="Project Name"]').value = (pageProject && pageProject.value) || PROJECT;
    dialog.querySelector('[name="Zone"]').value = (pageZone && pageZone.value) || ZONE;
    document.body.appendChild(dialog);

    form = dialog.querySelector('form');
    status = dialog.querySelector('.cpop_status');
    done = dialog.querySelector('.cpop_done');

    dialog.addEventListener('click', function (e) {
      /* A click on the backdrop lands on the dialog element itself. */
      if (e.target === dialog || e.target.closest('[data-cpop-close]')) close();
    });
    dialog.addEventListener('close', function () {
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    });
    form.addEventListener('input', function (e) {
      e.target.setAttribute('data-touched', 'true');
    });
    form.addEventListener('submit', submit);
    /* showModal() already closes on Esc; this covers the fallback path. */
    document.addEventListener('keydown', function (e) {
      if ((e.key === 'Escape' || e.key === 'Esc') && dialog.hasAttribute('open')) close();
    });
  }

  function open(kind) {
    current = OFFERS[kind] || OFFERS.enquire;
    dialog.querySelector('.cpop_title').textContent = current.title;
    dialog.querySelector('.cpop_lede').textContent = current.lede;
    var send = form.querySelector('[type="submit"]');
    if (!send.disabled) send.textContent = current.button;
    /* Opened again after a lead was sent: show the form, not the thank-you. */
    form.hidden = false;
    done.hidden = true;
    status.textContent = '';
    markShown();
    lastFocus = document.activeElement;
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function close() {
    if (typeof dialog.close === 'function') {
      dialog.close();
    } else {
      dialog.removeAttribute('open');
    }
  }

  /* Opening over a half-typed enquiry would take the visitor's keystrokes. */
  function busy() {
    /* An open menu drawer or picture is over the page; the menu sitting in
       the bar on a wide screen is not. */
    var other = document.querySelector('dialog[open]:not(.cpop)');
    if (other && getComputedStyle(other).position === 'fixed') return true;
    var el = document.activeElement;
    return !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
  }

  function autoOpen() {
    if (sent() || shown()) return;
    if (busy()) {
      timer = window.setTimeout(autoOpen, RETRY_MS);
      return;
    }
    open('price');
  }

  function submit(e) {
    e.preventDefault();
    /* Bots fill the hidden field; let them think it worked. */
    if (form.elements.company.value) return;
    if (!form.reportValidity()) {
      status.textContent = 'Please check the highlighted fields and try again.';
      return;
    }
    var button = form.querySelector('[type="submit"]');
    var label = button.textContent;
    button.disabled = true;
    button.textContent = 'Sending';
    status.textContent = '';

    var payload = {
      name: form.elements.name.value,
      email: form.elements.email.value,
      phone: form.elements.phone.value,
      message: (current || OFFERS.enquire).message,
      project: form.elements['Project Name'].value || PROJECT,
      zone: form.elements.Zone.value || ZONE,
      lead_source: form.elements.lead_source.value,
      page: window.location.pathname,
      company: ''
    };

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (response) {
        /* fetch does not reject on 4xx or 5xx, so read the verdict. */
        return response.json().then(
          function (body) { return { ok: response.ok, body: body || {} }; },
          function () { return { ok: response.ok, body: {} }; }
        );
      })
      .then(function (result) {
        if (!result.ok || !result.body.ok) {
          var err = new Error(result.body.error || FALLBACK);
          err.shown = !!result.body.error;
          throw err;
        }
        remember();
        window.clearTimeout(timer);
        form.hidden = true;
        done.hidden = false;
        done.querySelector('button').focus();
      })
      .catch(function (error) {
        button.disabled = false;
        button.textContent = label;
        status.textContent = (error && error.shown && error.message) || FALLBACK;
      });
  }

  function init() {
    if (sent() || shown()) return;
    if (!dialog) build();
    timer = window.setTimeout(autoOpen, DELAY_MS);
  }

  /* Offer buttons (data-cta) and the button-styled links to the contact page
     open the form here, so asking takes one click instead of a page load.
     Plain text links (menu, footer) still go to the contact page, as do
     clicks that open a new tab, and every link keeps its href for a browser
     without this script. Works whether or not the timed opening has run. */
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (CONTACT_PATH.test(window.location.pathname)) return;
    var el = e.target.closest && e.target.closest('[data-cta], a.button[href], a.btn-solid[href]');
    if (!el) return;
    var kind = el.getAttribute('data-cta');
    if (!kind) {
      var url;
      try { url = new URL(el.getAttribute('href'), window.location.href); } catch (err) { return; }
      if (url.origin !== window.location.origin || !CONTACT_PATH.test(url.pathname) || url.hash) return;
      kind = 'enquire';
    }
    e.preventDefault();
    window.clearTimeout(timer);
    if (!dialog) build();
    open(kind);
  });

  /* After the page has loaded, so the pop-up costs the page nothing. */
  if (document.readyState === 'complete') {
    init();
  } else {
    window.addEventListener('load', init);
  }
}());
