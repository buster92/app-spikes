const title = document.querySelector("#gameTitle");
const instruction = document.querySelector("#gameInstruction");
const host = document.querySelector("#gameHost");

const LANE_TITLE = "Avoid the Block";
const LANE_INSTRUCTION = "Move the green diamond OUT of the falling red block's lane";
const LANE_HINT = "TAP A SAFE LANE · RED = DANGER";

function applyPlaytestCopy() {
  // Keep this observer idempotent. Writing the same text back into an observed
  // node creates another mutation on Safari and can starve the event loop,
  // leaving the next game card invisible and the HUD apparently unresponsive.
  if (title?.textContent === "Lane Dodge") {
    title.textContent = LANE_TITLE;
    if (instruction?.textContent !== LANE_INSTRUCTION) {
      instruction.textContent = LANE_INSTRUCTION;
    }
  }

  const laneHint = host?.querySelector(".lane-hint");
  if (laneHint && laneHint.textContent !== LANE_HINT) {
    laneHint.textContent = LANE_HINT;
  }
}

const observer = new MutationObserver(applyPlaytestCopy);
if (title) observer.observe(title, { childList: true, characterData: true, subtree: true });
if (host) observer.observe(host, { childList: true, subtree: true });
applyPlaytestCopy();
