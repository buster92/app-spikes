const PRESENTATIONS = new Set(["creator", "anonymous"]);

export function socialPresentation(value) {
  return PRESENTATIONS.has(value) ? value : "creator";
}

export function socialEventProperties(presentation, properties = {}) {
  return { ...properties, presentation: socialPresentation(presentation) };
}

export function isActiveMountedPlay({ activePlay, play, controller }) {
  return activePlay === play && Boolean(controller);
}

export function mountFailureReason(error) {
  if (error?.code === "unavailable_playable") return "unavailable_playable";
  if (error?.code === "playable_mismatch") return "playable_mismatch";
  if (error?.code === "unsupported_runtime") return "unsupported_runtime";
  return "mount_failed";
}
