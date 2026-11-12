/*
 * Sends the contact form to this site's own lead endpoint.
 *
 * Every enquiry form sits in an element marked data-lead-form, next to its
 * thank-you message (.lead-form_done) and its error message
 * (.lead-form_fail), both Bootstrap alerts that start hidden. The form posts
 * to POST /api/lead, handled by worker/index.js in this repository: the
 * enquiry is written to KV before any notification is attempted, then emailed,
 * sent to Telegram and added to the shared sheet. Nothing here is a
 * third-party service and nothing secret reaches the browser.
 *
 * Three hidden inputs are read from the markup, so every lead is tracked:
 * "Project Name" (falls back to PROJECT below), Zone (falls back to ZONE
 * below) and lead_source (PNZ MS Lead).
 *
 * A form marked data-skip-email is left alone.
 */
(function () {
  'use strict';

  /* Same-origin, so there is no key, no CORS and no third party. */
  var ENDPOINT = '/api/lead';

  /* Recorded with every lead so one inbox can serve several projects. */
  var PROJECT = "Sobha Hennur";

  /* The project's zone, as the shared lead sheet's Project Zone column
   * names it. */
  var ZONE = "North Bangalore";

  /* A Bootstrap page marks the wrapper data-lead-form; a page still in its
   * Webflow markup (a standalone landing page, say) uses .w-form. */
  function wrapperOf(form) {
    return form.closest ? form.closest('[data-lead-form], .w-form') : null;
  }

  function isHandled(form) {
    if (!form || form.tagName !== 'FORM' || !wrapperOf(form)) return false;
    return !form.hasAttribute('data-skip-email');
  }

  function show(el) {
    if (!el) return;
    el.hidden = false;
    if (el.classList.contains('w-form-done') || el.classList.contains('w-form-fail')) el.style.display = 'block';
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    el.focus();
  }

  function hide(el) {
    if (!el) return;
    el.hidden = true;
    if (el.classList.contains('w-form-done') || el.classList.contains('w-form-fail')) el.style.display = 'none';
  }

  function valueOf(form, name) {
    var field = form.elements[name];
    return field && typeof field.value === 'string' ? field.value : '';
  }

  function send(form) {
    var wrapper = wrapperOf(form);
    var done = wrapper.querySelector('.lead-form_done, .w-form-done');
    var fail = wrapper.querySelector('.lead-form_fail, .w-form-fail');
    var button = form.querySelector('[type="submit"]');
    /* A <button> shows its text; an <input type="submit"> its value. */
    var prop = button && button.tagName === 'INPUT' ? 'value' : 'textContent';
    var label = button ? button[prop] : null;
    var wait = button ? button.getAttribute('data-wait') : null;

    if (button) {
      button.disabled = true;
      if (wait) button[prop] = wait;
    }
    hide(fail);

    function restore() {
      if (!button) return;
      button.disabled = false;
      if (label !== null) button[prop] = label;
    }

    var payload = {
      name: valueOf(form, 'Name'),
      email: valueOf(form, 'Email'),
      phone: valueOf(form, 'Phone'),
      message: valueOf(form, 'Message'),
      /* Hidden field in the markup (name="Project Name"). */
      project: valueOf(form, 'Project Name') || PROJECT,
      /* Hidden field in the markup (name="Zone"). */
      zone: valueOf(form, 'Zone') || ZONE,
      /* Hidden field in the markup (name="lead_source"), read from the form so
       * a landing page or campaign variant can carry its own value. */
      lead_source: valueOf(form, 'lead_source'),
      /* Which page produced the lead. */
      page: window.location.pathname,
      /* Honeypot: hidden from people, filled by bots. The Worker answers a
       * filled one with 200 so the bot records success and does not adapt. */
      company: valueOf(form, 'company')
    };
    /* A site with no zone configured sends none, as before. */
    if (!payload.zone) delete payload.zone;

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (response) {
        /* fetch does not reject on 4xx or 5xx. Without this check the form
         * would show the thank-you message while the lead was rejected. */
        return response.json().then(
          function (body) { return { ok: response.ok, body: body }; },
          function () { return { ok: response.ok, body: {} }; }
        );
      })
      .then(function (result) {
        if (!result.ok || !result.body.ok) {
          throw new Error(result.body.error || 'Submission was rejected');
        }
        form.hidden = true;
        if (wrapper.classList.contains('w-form')) form.style.display = 'none';
        show(done);
        /* A lead is in, so the pop-up (contact-popup.js) stays closed. */
        try { window.localStorage.setItem('contact_popup_sent', '1'); } catch (e) { /* private mode */ }
      })
      .catch(function (error) {
        show(fail);
        restore();
        if (window.console) window.console.error('Lead submission failed:', error);
      });
  }

  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!isHandled(form)) return;
    event.preventDefault();
    /* The browser checks the required fields first; report them if not. */
    if (form.reportValidity && !form.reportValidity()) return;
    send(form);
  }, true);

  /* Added by script so a real visitor can never see or tab into it. */
  function addHoneypot(form) {
    if (form.elements.company) return;
    var input = document.createElement('input');
    input.type = 'text';
    input.name = 'company';
    input.tabIndex = -1;
    input.style.display = 'none';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('aria-hidden', 'true');
    form.appendChild(input);
  }

  function init() {
    [].filter.call(document.querySelectorAll('[data-lead-form] form, .w-form form'), isHandled).forEach(addHoneypot);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
