const legacy = new URLSearchParams(location.search).get("legacy") === "1";

if (legacy) {
  await import("./extra-games-register.js");
  await import("./playtest-tuning.js");
  await import("./playtest-round2.js");
  await import("./bus-jam-v2.js");
  await import("./bus-jam-v3.js");
  await import("./navigation-guard.js");
  await import("./app.js");
  await import("./progression.js");
  await import("./round3-ui.js");
} else {
  await import("./social/app.js");
}
