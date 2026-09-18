import { BUNDLED_PLAYABLES, playableRefFor } from "./catalog.js";

const at = (day) => `2026-09-${String(day).padStart(2, "0")}T12:00:00.000Z`;
const playable = (id) => BUNDLED_PLAYABLES.find((item) => item.id === id);

export function createSeedState() {
  const profiles = [
    { id: "actor_local", handle: "andres", displayName: "Andrés", avatar: "A", bio: "Building small games that become conversations.", badge: "Creator", isLocal: true },
    { id: "creator_maya", handle: "mayamakes", displayName: "Maya Chen", avatar: "M", bio: "Tiny puzzles, unreasonable confidence.", badge: "Puzzle maker" },
    { id: "creator_alex", handle: "alexloops", displayName: "Alex Rivera", avatar: "A", bio: "One more run is always the answer.", badge: "Speed runner" },
    { id: "creator_nova", handle: "nova_play", displayName: "Nova Okafor", avatar: "N", bio: "I make calm things unexpectedly competitive." },
    { id: "creator_jo", handle: "joystickjo", displayName: "Jo Park", avatar: "J", bio: "Arcade challenges for lunch breaks." },
    { id: "creator_lina", handle: "linapixels", displayName: "Lina Costa", avatar: "L", bio: "Color, timing, and questionable bets." },
  ];

  const resultRows = [
    ["result_maya_pattern", "creator_maya", "post_maya_pattern", "pattern-echo-v2", "completed", 6300],
    ["result_alex_meteor", "creator_alex", "post_alex_meteor", "meteor-dodge", "completed", 41],
    ["result_nova_bloom", "creator_nova", "post_nova_bloom", "tap-bloom", "completed", 38],
    ["result_jo_bus", "creator_jo", "post_jo_bus", "bus-escape-v3", "completed", 12400],
    ["result_lina_crate", "creator_lina", "post_lina_crate", "sokoban-push-v3", "completed", 18],
    ["result_alex_pattern", "creator_alex", "post_alex_pattern", "pattern-echo-v2", "completed", 7100],
  ];
  const results = resultRows.map(([id, actorId, postId, gameId, status, metric], index) => ({
    id, actorId, postId, playableRef: playableRefFor(playable(gameId)), status, metric,
    createdAt: at(17 - index), verification: "unverified", replayEvidence: null,
  }));
  const posts = [
    { id: "post_maya_pattern", creatorId: "creator_maya", createdAt: at(17), caption: "I finally got this pattern under seven seconds. Can you?", playableRef: playableRefFor(playable("pattern-echo-v2")), resultPolicy: { kind: "completion_then_lower_time" }, creatorResultId: "result_maya_pattern", status: "published", lineage: null, preview: { kind: "poster", tone: "violet" } },
    { id: "post_alex_meteor", creatorId: "creator_alex", createdAt: at(16), caption: "Nobody in my group has cleared 41. Prove us wrong.", playableRef: playableRefFor(playable("meteor-dodge")), resultPolicy: { kind: "completion_then_higher_score" }, creatorResultId: "result_alex_meteor", status: "published", lineage: null, preview: { kind: "poster", tone: "blue" } },
    { id: "post_nova_bloom", creatorId: "creator_nova", createdAt: at(15), caption: "A peaceful little game until you try to beat 38.", playableRef: playableRefFor(playable("tap-bloom")), resultPolicy: { kind: "higher_score" }, creatorResultId: "result_nova_bloom", status: "published", lineage: null, preview: { kind: "poster", tone: "pink" } },
    { id: "post_jo_bus", creatorId: "creator_jo", createdAt: at(14), caption: "Untangle this bus yard faster than 12.4 seconds.", playableRef: playableRefFor(playable("bus-escape-v3")), resultPolicy: { kind: "completion_then_lower_time" }, creatorResultId: "result_jo_bus", status: "published", lineage: null, preview: { kind: "poster", tone: "orange" } },
    { id: "post_lina_crate", creatorId: "creator_lina", createdAt: at(13), caption: "Eighteen moves. There has to be a cleaner route.", playableRef: playableRefFor(playable("sokoban-push-v3")), resultPolicy: { kind: "completion_then_lower_moves" }, creatorResultId: "result_lina_crate", status: "published", lineage: null, preview: { kind: "poster", tone: "green" } },
    { id: "post_alex_pattern", creatorId: "creator_alex", createdAt: at(12), caption: "Maya started this challenge. I made it through in 7.1 seconds.", playableRef: playableRefFor(playable("pattern-echo-v2")), resultPolicy: { kind: "completion_then_lower_time" }, creatorResultId: "result_alex_pattern", status: "published", lineage: { originalPostId: "post_maya_pattern", parentPostId: "post_maya_pattern", originalCreatorId: "creator_maya" }, preview: { kind: "poster", tone: "violet" } },
  ];

  return {
    schemaVersion: 1,
    actorId: "actor_local",
    profiles,
    posts,
    results,
    likes: [{ actorId: "actor_local", postId: "post_maya_pattern" }],
    follows: [{ followerId: "actor_local", followedId: "creator_maya" }, { followerId: "actor_local", followedId: "creator_alex" }],
    challenges: [{ id: "challenge_seed_open", challengerId: "creator_maya", targetActorId: "actor_local", sourcePostId: "post_maya_pattern", playableRef: playableRefFor(playable("pattern-echo-v2")), challengerResultId: "result_maya_pattern", responseResultId: null, state: "open", createdAt: at(18) }],
  };
}
