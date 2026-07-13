const form = document.querySelector("#generator-form");
const promptInput = document.querySelector("#prompt");
const result = document.querySelector("#result");
const loader = document.querySelector("#loader");
const image = document.querySelector("#result-image");
const openImage = document.querySelector("#open-image");
const error = document.querySelector("#error");
const submitButton = form.querySelector("button[type='submit']");

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
    const response = await fetch("/v1/images", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    const payload = await response.json();
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
