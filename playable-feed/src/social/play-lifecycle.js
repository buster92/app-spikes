const PRESENTATIONS = new Set(["creator", "anonymous"]);

export function socialPresentation(value) {
  return PRESENTATIONS.has(value) ? value : "creator";
}

export function socialEventProperties(presentation, properties = {}) {
  return { ...properties, presentation: socialPresentation(presentation) };
}

export function isActivePlayRequest({ activePlay, play }) {
  return activePlay === play;
}

export function isActiveMountedPlay({ activePlay, play, controller }) {
  return isActivePlayRequest({ activePlay, play }) && Boolean(controller);
}

export function runtimeCallbackDisposition({ activePlay, play, runtimeStarted, runtimeFailureLogged = false, finished = false, kind }) {
  if (!["error", "finish"].includes(kind)) throw new TypeError("Unsupported runtime callback kind");
  if (!isActivePlayRequest({ activePlay, play }) || finished) return "ignore";
  if (!runtimeStarted) return "buffer";
  if (kind === "finish" && runtimeFailureLogged) return "ignore";
  return "handle";
}

export function mountFailureReason(error) {
  if (error?.code === "unavailable_playable") return "unavailable_playable";
  if (error?.code === "playable_mismatch") return "playable_mismatch";
  if (error?.code === "unsupported_runtime") return "unsupported_runtime";
  return "mount_failed";
}
