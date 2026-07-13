const form = document.querySelector("#generator-form");
const promptInput = document.querySelector("#prompt");
const result = document.querySelector("#result");
const loader = document.querySelector("#loader");
const image = document.querySelector("#result-image");
const openImage = document.querySelector("#open-image");
const error = document.querySelector("#error");
const submitButton = form.querySelector("button[type='submit']");
const loginView = document.querySelector("#login-view");
const appView = document.querySelector("#app-view");
const loginForm = document.querySelector("#login-form");
const loginError = document.querySelector("#login-error");
const logoutButton = document.querySelector("#logout-button");

function showAuthenticated(authenticated) {
  loginView.hidden = authenticated;
  appView.hidden = !authenticated;
  logoutButton.hidden = !authenticated;
  if (!authenticated) document.querySelector("#username").focus();
}

async function checkSession() {
  try {
    const response = await fetch("/auth/session", { cache: "no-store" });
    showAuthenticated(response.ok);
  } catch {
    showAuthenticated(false);
    loginError.textContent = "Could not check the login. Please reload.";
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.textContent = "";
  const button = loginForm.querySelector("button[type='submit']");
  button.disabled = true;
  try {
    const response = await fetch("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: loginForm.elements.username.value,
        password: loginForm.elements.password.value,
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Login failed");
    loginForm.reset();
    showAuthenticated(true);
    promptInput.focus();
  } catch (caught) {
    loginError.textContent = caught instanceof Error ? caught.message : "Login failed";
  } finally {
    button.disabled = false;
  }
});

logoutButton.addEventListener("click", async () => {
  try {
    await fetch("/auth/logout", { method: "POST" });
  } finally {
    showAuthenticated(false);
  }
});

for (const button of document.querySelectorAll("[data-prompt]")) {
  button.addEventListener("click", () => {
    promptInput.value = button.dataset.prompt;
    promptInput.focus();
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const prompt = promptInput.value.trim();
  if (!prompt) return;

  result.hidden = false;
  loader.hidden = false;
  image.hidden = true;
  openImage.hidden = true;
  error.textContent = "";
  submitButton.disabled = true;
  result.scrollIntoView({ behavior: "smooth", block: "start" });

  try {
    const response = await fetch("/browser/images", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    const payload = await response.json();
    if (response.status === 401) {
      showAuthenticated(false);
      throw new Error("Your login expired. Log in again.");
    }
    if (!response.ok) throw new Error(payload.error ?? "Something went sideways");

    image.src = payload.url;
    image.alt = `Generated reaction image for: ${payload.prompt}`;
    openImage.href = payload.url;
    await image.decode();
    loader.hidden = true;
    image.hidden = false;
    openImage.hidden = false;
  } catch (caught) {
    loader.hidden = true;
    error.textContent = caught instanceof Error ? caught.message : "Something went sideways";
  } finally {
    submitButton.disabled = false;
  }
});

void checkSession();
