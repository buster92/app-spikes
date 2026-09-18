export const BUNDLED_PLAYABLES = Object.freeze([
  { id: "meteor-dodge", title: "Meteor Dodge", path: "./examples/meteor-dodge.game.json", policy: { kind: "completion_then_higher_score" }, seed: 42, cover: "☄️", runtime: "playloop-2d-v0", manifestVersion: 1, manifestRef: "sha256:697bfe8eaae87e872fc82437b1fa9598d0a9168efbaf698985c6e088abd2d7be", specRef: "sha256:a96e11ff28e2b086afb0022931a2d9b560fd73ba101ec8914f6a34c61852b13c" },
  { id: "tap-bloom", title: "Tap Bloom", path: "./examples/tap-bloom.game.json", policy: { kind: "higher_score" }, seed: 17, cover: "🌸", runtime: "playloop-2d-v0", manifestVersion: 1, manifestRef: "sha256:d85c686df31297d443cfa46797196d27c9510b46850888c28dcbe2f4c3caa865", specRef: "sha256:ffa319e8ebb7ee380a115a924580ec82bcf68cbc57a69dfac198da964fb7d417" },
  { id: "pattern-echo-v2", title: "Pattern Echo", path: "./examples/pattern-echo-v2.game.json", policy: { kind: "completion_then_lower_time" }, seed: 91, cover: "🧠", runtime: "playloop-2d-v2", manifestVersion: 1, manifestRef: "sha256:33d7cc1715b32bb706b451b30406a0666efdbf776b60b8b4a31239fb9f178e18", specRef: "sha256:e7a8a6247951acc843fcd9c1934193d69deb33ab7864bb581f6810f0cd2cb965" },
  { id: "bus-escape-v3", title: "Bus Escape", path: "./examples/bus-escape-v3.game.json", policy: { kind: "completion_then_lower_time" }, seed: 7, cover: "🚌", runtime: "playloop-2d-v3", manifestVersion: 1, manifestRef: "sha256:4c0815406ec21111bb093fd2de5253118a3f2badd5d491e756e521c3cb22a4fb", specRef: "sha256:b00c9dc34de970f5a692861dfa7f82c2f97e9877b073cd87b2a12badd03335b5" },
  { id: "sokoban-push-v3", title: "Crate Push", path: "./examples/sokoban-push-v3.game.json", policy: { kind: "completion_then_lower_moves" }, seed: 33, cover: "📦", runtime: "playloop-2d-v3", manifestVersion: 1, manifestRef: "sha256:f7a37c20ecffab36df9b67d9fce3b0709d2afb13ac8feac5319c2bcc24a34e8a", specRef: "sha256:998ccb4b60229e7f9835d30ff507a521245b380d88bdd022d6d26ce27819db7d" },
]);

export function playableRefFor(item, seed = item.seed) {
  return { runtime: item.runtime, gameId: item.id, manifestVersion: item.manifestVersion, manifestRef: item.manifestRef, specRef: item.specRef, seed };
}

export function bundledPlayable(gameId) {
  return BUNDLED_PLAYABLES.find((item) => item.id === gameId) || null;
}
