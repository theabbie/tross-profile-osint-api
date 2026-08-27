const form = document.querySelector("#profile-form");
const input = document.querySelector("#profile-url");
const button = document.querySelector("#submit-button");
const statusNode = document.querySelector("#status");
const output = document.querySelector("#output");

let config = {
  recaptcha: {
    required: false,
    siteKey: null
  }
};
let recaptchaWidgetId = null;
let pendingUrl = null;

init();

async function init() {
  try {
    config = await fetchJson("/api/config");
    if (config.recaptcha.required && config.recaptcha.siteKey) {
      await loadRecaptcha();
      recaptchaWidgetId = grecaptcha.render("captcha-anchor", {
        sitekey: config.recaptcha.siteKey,
        size: "invisible",
        callback: onCaptchaToken,
        "error-callback": onCaptchaError,
        "expired-callback": onCaptchaExpired
      });
    }
  } catch (error) {
    setStatus(error.message, true);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  pendingUrl = input.value.trim();
  output.textContent = "{}";

  if (!pendingUrl) {
    setStatus("Enter a LinkedIn profile URL.", true);
    return;
  }

  if (config.recaptcha.required) {
    if (recaptchaWidgetId === null) {
      setStatus("reCAPTCHA is still loading. Try again in a moment.", true);
      return;
    }
    setBusy(true, "Verifying request...");
    grecaptcha.execute(recaptchaWidgetId);
    return;
  }

  await callProfileApi(pendingUrl);
});

async function onCaptchaToken(token) {
  if (!pendingUrl) {
    return;
  }

  try {
    await callProfileApi(pendingUrl, token);
  } finally {
    grecaptcha.reset(recaptchaWidgetId);
  }
}

function onCaptchaError() {
  setBusy(false, "reCAPTCHA could not verify the request. Please try again.", true);
}

function onCaptchaExpired() {
  setBusy(false, "reCAPTCHA expired. Please submit again.", true);
}

async function callProfileApi(url, recaptchaToken) {
  setBusy(true, "Fetching profile...");
  try {
    const response = await fetch("/api/profile", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ url, recaptchaToken })
    });

    const payload = await response.json();
    output.textContent = JSON.stringify(payload, null, 2);

    if (!response.ok) {
      const message = payload.error?.message ?? "Request failed.";
      setBusy(false, message, true);
      return;
    }

    const warningCount = payload.warnings?.length ?? 0;
    setBusy(false, warningCount > 0 ? `Profile returned with ${warningCount} warning(s).` : "Profile fetched.");
  } catch (error) {
    setBusy(false, error.message, true);
  }
}

function setBusy(isBusy, message, isError = false) {
  button.disabled = isBusy;
  setStatus(message, isError);
}

function setStatus(message, isError = false) {
  statusNode.textContent = message;
  statusNode.classList.toggle("error", isError);
}

async function fetchJson(url) {
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message ?? "Request failed.");
  }
  return payload;
}

function loadRecaptcha() {
  if (window.grecaptcha) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    window.onRecaptchaLoaded = () => resolve();
    const script = document.createElement("script");
    script.src = `https://www.google.com/recaptcha/api.js?onload=onRecaptchaLoaded&render=explicit`;
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error("Could not load reCAPTCHA."));
    document.head.append(script);
  });
}
