const title = document.querySelector("#gameTitle");
const instruction = document.querySelector("#gameInstruction");
const host = document.querySelector("#gameHost");

function applyPlaytestCopy() {
  if (title?.textContent === "Lane Dodge") {
    title.textContent = "Avoid the Block";
    instruction.textContent = "Move the green diamond OUT of the falling red block's lane";
  }

  const laneHint = host?.querySelector(".lane-hint");
  if (laneHint) laneHint.textContent = "TAP A SAFE LANE · RED = DANGER";
}

const observer = new MutationObserver(applyPlaytestCopy);
if (title) observer.observe(title, { childList: true, characterData: true, subtree: true });
if (host) observer.observe(host, { childList: true, subtree: true });
applyPlaytestCopy();
