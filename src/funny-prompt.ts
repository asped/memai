const MAX_PROMPT_LENGTH = 1_000;

export function normalizePrompt(prompt: string): string {
  const normalized = prompt.trim().replace(/\s+/g, " ");

  if (!normalized) {
    throw new Error("Prompt cannot be empty");
  }

  if (normalized.length > MAX_PROMPT_LENGTH) {
    throw new Error(`Prompt must be ${MAX_PROMPT_LENGTH} characters or fewer`);
  }

  return normalized;
}

export function makeFunnyImagePrompt(prompt: string): string {
  const idea = normalizePrompt(prompt);

  return [
    "Create a funny, instantly readable reaction image for this idea:",
    `\"${idea}\"`,
    "Use one strong visual joke, an expressive subject, and a simple composition that remains clear at chat-message size.",
    "Make it feel original and highly shareable. Avoid logos, watermarks, UI chrome, and copyrighted characters.",
    "Only render words in the image if the idea explicitly asks for a caption or exact text.",
  ].join("\n");
}
