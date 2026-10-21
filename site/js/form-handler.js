/*
 * Sends Webflow form submissions to this site's own lead endpoint.
 *
 * A Webflow export ships its forms with no `action`, so webflow.js posts them
 * to https://webflow.com/api/v1/form/{siteId}. That endpoint only accepts
 * submissions from Webflow-hosted domains, so on any other host every
 * submission fails and the visitor sees "Oops! Something went wrong."
 *
 * These forms post to POST /api/lead instead, handled by worker/index.js in
 * this repository: the enquiry is written to KV before any notification is
 * attempted, then emailed and sent to Telegram. Nothing here is a third-party
 * service and nothing secret reaches the browser.
 *
 * The success and error messages already in the Webflow markup are reused, so
 * the visitor stays on the page and the form behaves as it was designed to.
 *
 * ---------------------------------------------------------------------------
 * DROP-IN USE ON ANOTHER WEBFLOW EXPORT
 *
 *   1. Copy this file into the export's js/ folder.
 *   2. Add this line before </body> on every page that has a form:
 *        <script src="js/form-handler.js" type="text/javascript"></script>
 *   3. Set PROJECT below, and deploy the Worker that answers ENDPOINT.
 *
 * No changes to the form markup are needed. Every Webflow form on the page is
 * picked up automatically, so this works on an untouched export.
 *
 * Two hidden inputs ARE read from the markup, so every lead is tracked:
 * "Project Name" (falls back to PROJECT below) and lead_source (PNZ MS Lead).
 * Forms without them submit exactly as before.
 *
 * Password pages, search forms, and anything marked data-skip-email are left
 * alone. To exclude a form, add data-skip-email to it.
 * ---------------------------------------------------------------------------
 */
(function () {
  'use strict';

  /* Same-origin, so there is no key, no CORS and no third party. */
  var ENDPOINT = '/api/lead';

  /* Recorded with every lead so one inbox can serve several projects. */
  var PROJECT = "Sobha Hennur";

  /* Webflow wraps every form in a .w-form div that also holds the success and
   * error messages, which makes it the reliable way to find forms in an export
   * without depending on the class names a particular site happens to use. */
  function wrapperOf(form) {
    return form.closest ? form.closest('.w-form') : null;
  }

  function isHandled(form) {
    if (!form || form.tagName !== 'FORM' || !wrapperOf(form)) return false;
    if (form.hasAttribute('data-skip-email')) return false;
    /* The password page posts to Webflow's own auth endpoint, and a search
     * form navigates to a results page. Neither is a lead. */
    if (/\.wf_auth/.test(form.getAttribute('action') || '')) return false;
    if (form.classList.contains('w-password-page')) return false;
    if (form.querySelector('input[type="search"]')) return false;
    return true;
  }

  function show(el) {
    if (!el) return;
    el.style.display = 'block';
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    el.focus();
  }

  function hide(el) {
    if (el) el.style.display = 'none';
  }

  function valueOf(form, name) {
    var field = form.elements[name];
    return field && typeof field.value === 'string' ? field.value : '';
  }

  function send(form) {
    var wrapper = wrapperOf(form);
    var done = wrapper.querySelector('.w-form-done');
    var fail = wrapper.querySelector('.w-form-fail');
    var button = form.querySelector('[type="submit"]');
    var label = button ? button.value : null;
    var wait = button ? button.getAttribute('data-wait') : null;

    if (button) {
      button.disabled = true;
      button.classList.add('w-form-loading');
      if (wait) button.value = wait;
    }
    hide(fail);

    function restore() {
      if (!button) return;
      button.disabled = false;
      button.classList.remove('w-form-loading');
      if (label !== null) button.value = label;
    }

    var payload = {
      name: valueOf(form, 'Name'),
      email: valueOf(form, 'Email'),
      phone: valueOf(form, 'Phone'),
      message: valueOf(form, 'Message'),
      /* Hidden field in the markup (name="Project Name"). */
      project: valueOf(form, 'Project Name') || PROJECT,
      /* Hidden field in the markup (name="lead_source"). Read from the form
       * rather than hardcoded here, so a landing page or a campaign variant
       * can carry its own value without touching this file. Absent on a form
       * that does not declare it, which the Worker treats as unset. */
      lead_source: valueOf(form, 'lead_source'),
      /* Which page produced the lead, so enquiries can be attributed. */
      page: window.location.pathname,
      /* Honeypot: hidden from people, filled by bots. The Worker answers a
       * filled one with 200 so the bot records success and does not adapt. */
      company: valueOf(form, 'company')
    };

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
        /* What Webflow does on success: hide the form, reveal the thank-you. */
        form.style.display = 'none';
        show(done);
        /* A lead is in, so the 10 second pop-up (contact-popup.js) stops. */
        try { window.localStorage.setItem('contact_popup_sent', '1'); } catch (e) { /* private mode */ }
      })
      .catch(function (error) {
        show(fail);
        restore();
        if (window.console) {
          window.console.error('Lead submission failed:', error);
        }
      });
  }

  /* Listening on the document in the capture phase means this runs before the
   * handler webflow.js binds to the form itself, whatever order the scripts
   * load in. Stopping propagation there keeps webflow.js from also posting the
   * form to an endpoint that would reject it. */
  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!isHandled(form)) return;
    event.preventDefault();
    event.stopPropagation();
    send(form);
  }, true);

  /* Added by script rather than to the markup so the Webflow export stays
   * exactly as exported, and so a real visitor can never see or tab into it. */
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
    var forms = [].filter.call(document.querySelectorAll('.w-form form'), isHandled);
    forms.forEach(addHoneypot);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
