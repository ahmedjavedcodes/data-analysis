import { describe, expect, it } from "vitest";

import { INITIAL_STATE, liveSummary, parseEvent, reduceStream, type LiveState, type StreamAction } from "@/lib/stream";

const scored = (id: string, score: number, level: number, sentiment: string, features: { name: string; score: number }[] = []) =>
  JSON.stringify({ done: 1, total: 3, review_id: id, rating: 5, text: `review ${id}`, score, level, sentiment, features });

function play(events: [string, string][]): LiveState {
  return events.reduce<LiveState>((state, [name, data]) => {
    const event = parseEvent(name, data);
    if (!event) throw new Error(`unparsed ${name}`);
    return reduceStream(state, event);
  }, INITIAL_STATE);
}

const RUN: [string, string][] = [
  ["stage", JSON.stringify({ stage: "validating", message: "x" })],
  ["product", JSON.stringify({ name: "Kids tracksuit", category_breadcrumb: "Fashion > Boys", price: 675, overall_rating: 3.7, rating_count: 3, url: "u" })],
  ["stage", JSON.stringify({ stage: "scraping", message: "x" })],
  ["reviews", JSON.stringify({ collected: 3 })],
  ["stage", JSON.stringify({ stage: "cleaning", message: "x" })],
  ["cleaned", JSON.stringify({ clean: 3, dropped: 0 })],
  ["stage", JSON.stringify({ stage: "categorizing", message: "x" })],
  [
    "categories",
    JSON.stringify({
      product_category: "Tracksuit",
      used_fallback: false,
      features: [
        { name: "Fabric", description: "f" },
        { name: "Fit", description: "s" },
        { name: "Overall", description: "o" },
      ],
    }),
  ],
  ["scale", JSON.stringify({ rubric_version: "jev_sentiment_v3", max_level: 2, labels: ["Negative", "Neutral", "Positive"] })],
  ["stage", JSON.stringify({ stage: "scoring", message: "x" })],
  ["scored", scored("a", 0.1, 0, "negative", [{ name: "Fabric", score: 0.2 }])],
  ["scored", scored("b", 1.9, 2, "positive", [{ name: "Fabric", score: 1.8 }, { name: "Fit", score: 1.0 }])],
  ["scored", scored("c", 1.0, 1, "neutral")],
];

describe("stream reducer", () => {
  it("accumulates every stage's output", () => {
    const state = play(RUN);
    expect(state.status).toBe("running");
    expect(state.stage).toBe("scoring");
    expect(state.product?.name).toBe("Kids tracksuit");
    expect(state.cleaned).toEqual({ clean: 3, dropped: 0 });
    expect(state.scale).toEqual({ maxLevel: 2, labels: ["Negative", "Neutral", "Positive"] });
    expect(state.scored).toHaveLength(3);
  });

  it("ignores malformed events", () => {
    expect(parseEvent("scored", "{not json")).toBeNull();
    expect(parseEvent("scored", JSON.stringify({ done: 1 }))).toBeNull();
    expect(parseEvent("mystery", "{}")).toBeNull();
  });

  it("stops at failure and maps a dropped connection to an error code", () => {
    const lost = reduceStream(play(RUN.slice(0, 3)), { type: "lost" } as StreamAction);
    expect(lost.status).toBe("failed");
    expect(lost.error?.code).toBe("STREAM_LOST");
    expect(reduceStream(INITIAL_STATE, { type: "lost" }).error?.code).toBe("BACKEND_UNREACHABLE");
  });
});

describe("liveSummary (0-2 scale)", () => {
  const summary = liveSummary(play(RUN));

  it("tallies sentiment and net from the scored reviews", () => {
    expect(summary.sentiment).toEqual({ positive: 1, neutral: 1, negative: 1 });
    expect(summary.netSentiment).toBe(0);
    expect(summary.avgScore).toBeCloseTo(1.0);
    expect(summary.levels).toEqual([1, 1, 1]);
    expect(summary.maxLevel).toBe(2);
  });

  it("builds live feature insights the way the backend does", () => {
    const [fabric, fit, overall] = summary.features;
    expect([fabric?.name, fit?.name, overall?.name]).toEqual(["Fabric", "Fit", "Overall"]);
    expect(fabric?.mention_count).toBe(2);
    expect(fabric?.avg_score).toBeCloseTo(1.0);
    expect(fabric?.sentiment).toEqual({ positive: 1, neutral: 0, negative: 1 });
    expect(fabric?.quotes[0]?.review_id).toBe("a"); // lowest first
    expect(overall?.mention_count).toBe(1); // review c mentions no feature
  });

  it("moves the progress bar through scoring", () => {
    expect(summary.progress).toBeGreaterThan(0.5);
    expect(summary.progress).toBeLessThan(1);
  });
});
