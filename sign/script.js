const signupForm = document.getElementById("signup-form");
const feedbackEl = document.getElementById("form-feedback");
const primaryButton = document.getElementById("primary-button");

function setFeedback(message, type = "") {
  feedbackEl.textContent = message;
  feedbackEl.classList.remove("is-error", "is-success");
  if (type) {
    feedbackEl.classList.add(type);
  }
}

function normalizePhoneNumber(rawPhone) {
  return rawPhone.replace(/[^\d+]/g, "");
}

function isValidPhoneNumber(phoneNumber) {
  const hasLeadingPlus = phoneNumber.startsWith("+");
  const digitsOnly = phoneNumber.replace(/\D/g, "");
  return hasLeadingPlus && digitsOnly.length >= 10 && digitsOnly.length <= 14;
}

signupForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const contact1 = normalizePhoneNumber(document.getElementById("contact1").value.trim());
  if (!isValidPhoneNumber(contact1)) {
    setFeedback("Emergency contact 1 must be a valid phone number with country code (e.g. +91XXXXXXXXXX).", "is-error");
    return;
  }

  // Store in local storage for SOS functionality
  localStorage.setItem("aegis_emergency_contact_1", contact1);

  setFeedback("Emergency contacts saved successfully. Redirecting...", "is-success");

  primaryButton.disabled = true;

  setTimeout(() => {
    window.location.href = "../home/index.html";
  }, 1500);
});
