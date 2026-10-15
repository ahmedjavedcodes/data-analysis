import { describe, expect, it } from "vitest";

import { errorMessage } from "@/lib/copy";
import { checkDarazUrl } from "@/lib/daraz-url";
import { classifyFeature, moodVerdict, reviewMismatch, shareSplit, starsHideFriction } from "@/lib/insights";
import { AnalysisResult, type FeatureInsight, type RecencyWindow, type Review } from "@/lib/schemas";
import { fmtNet, levelBg, nearestLevel, scoreTone, starTone, thresholds } from "@/lib/scale";

import fixture from "./fixtures/analysis.json";

describe("AnalysisResult schema", () => {
  it("parses a real backend analysis (Sensodyne run, saved on the 0-4 scale)", () => {
    const parsed = AnalysisResult.parse(fixture);
    expect(parsed.product.name).toBe("Sensodyne Original Toothpaste 70gm");
    expect(parsed.reviews).toHaveLength(78);
    expect(parsed.scale.max_level).toBe(4);
  });

  it("rejects a response missing a field", () => {
    const withoutStats: Record<string, unknown> = { ...fixture };
    delete withoutStats.stats;
    expect(AnalysisResult.safeParse(withoutStats).success).toBe(false);
  });
});

describe("checkDarazUrl", () => {
  it.each([
    ["https://www.daraz.pk/products/sensodyne-original-toothpaste-70gm-i496954821-s2379054862.html?spm=x", true],
    ["https://m.daraz.pk/products/x-i123.html", true],
    ["https://www.daraz.pk/products/-i574837330-s2655076903.html?pvid=446cb448&spm=a2a0e.tm80335142", true],
    ["https://www.daraz.pk/products/.html", false],
    ["https://www.daraz.lk/products/x-i123.html", false],
    ["https://www.daraz.pk/catalog/?q=phone", false],
    ["javascript:alert(1)", false],
    ["", false],
  ])("%s -> %s", (url, ok) => {
    expect(checkDarazUrl(url).ok).toBe(ok);
  });

  it("drops the query string", () => {
    const check = checkDarazUrl("https://www.daraz.pk/products/x-i123-s4.html?spm=abc#r");
    expect(check).toEqual({ ok: true, url: "https://www.daraz.pk/products/x-i123-s4.html" });
  });
});

describe("score scale", () => {
  it("derives thresholds from the range", () => {
    expect(thresholds(2)).toEqual({ positive: 1.5, negative: 0.5 });
    expect(thresholds(4)).toEqual({ positive: 2.5, negative: 1.5 });
  });

  it.each([
    [2, 2, "pos"],
    [1.5, 2, "pos"],
    [1.49, 2, "neu"],
    [0.5, 2, "neu"],
    [0.49, 2, "neg"],
    [2.5, 4, "pos"],
    [1.49, 4, "neg"],
    [null, 2, "none"],
  ] as const)("score %s on 0-%s -> %s", (score, maxLevel, tone) => {
    expect(scoreTone(score, maxLevel)).toBe(tone);
  });

  it("rounds to the nearest level half up, like the backend", () => {
    expect([0.49, 0.5, 1.5, 2].map((s) => nearestLevel(s, 2))).toEqual([0, 1, 2, 2]);
  });

  it("shades levels by position: neutral middle, strong extremes only on 5+ levels", () => {
    expect([0, 1, 2].map((l) => levelBg(l, 2))).toEqual(["bg-neg", "bg-neu", "bg-pos"]);
    expect([0, 2, 4].map((l) => levelBg(l, 4))).toEqual(["bg-neg-strong", "bg-neu", "bg-pos-strong"]);
  });

  it("keeps the CLAUDE.md star scale", () => {
    expect([starTone(4), starTone(3.9), starTone(2.9)]).toEqual(["pos", "neu", "neg"]);
  });

  it("signs net sentiment", () => {
    expect([fmtNet(71.8), fmtNet(-12.4), fmtNet(0), fmtNet(null)]).toEqual(["+72", "-12", "0", "–"]);
  });
});

const win = (days: number | null, scored: number, avg: number | null): RecencyWindow => ({
  days,
  review_count: scored,
  scored_count: scored,
  avg_score: avg,
  net_sentiment: null,
  avg_rating: null,
});

describe("moodVerdict", () => {
  it("uses 90 days when 30 days has too few reviews", () => {
    const v = moodVerdict([win(7, 3, 1.4), win(30, 3, 1.4), win(90, 9, 1.19), win(null, 78, 1.42)], 2);
    expect(v.kind).toBe("dropping");
    expect(v.window?.days).toBe(90);
    expect(v.delta).toBeCloseTo(-0.23);
  });

  it("scales the 'real move' threshold with the range", () => {
    // +0.15 is a move on 0-2 (threshold 0.1) but noise on 0-4 (threshold 0.2).
    const windows = [win(30, 6, 1.45), win(null, 100, 1.3)];
    expect(moodVerdict(windows, 2).kind).toBe("improving");
    expect(moodVerdict(windows, 4).kind).toBe("stable");
  });

  it("says so when recent windows are too thin", () => {
    expect(moodVerdict([win(30, 2, 0.2), win(90, 4, 0.2), win(null, 50, 1.4)], 2).kind).toBe("insufficient");
  });
});

const feature = (name: string, share: number, score: number | null, rating: number | null = 5): FeatureInsight => ({
  name,
  description: "",
  mention_count: score == null ? 0 : Math.round(share * 100),
  mention_share: share,
  avg_score: score,
  net_sentiment: null,
  sentiment: { positive: 0, neutral: 0, negative: 0 },
  avg_rating: rating,
  quotes: [],
});

describe("feature classes (0-2 scale)", () => {
  const features = [
    feature("Cleaning", 0.32, 1.6),
    feature("Value", 0.12, 1.1),
    feature("Taste", 0.04, 1.2),
    feature("Fraud", 0.05, 0.3),
    feature("Overall", 0.5, 1.5),
  ];
  const split = shareSplit(features);

  it("splits on the median share of specific features", () => {
    expect(split).toBeCloseTo((0.05 + 0.12) / 2);
  });

  it("separates risk, common friction, isolated friction and strengths", () => {
    expect(features.map((f) => classifyFeature(f, split, 2))).toEqual([
      "strength",
      "common-friction",
      "isolated-friction",
      "risk",
      "strength",
    ]);
    expect(classifyFeature(feature("Ghost", 0, null), split, 2)).toBe("unmentioned");
  });

  it("flags features whose stars hide below-Positive words", () => {
    expect(starsHideFriction(feature("Taste", 0.04, 1.2, 5), 2)).toBe(true);
    expect(starsHideFriction(feature("Taste", 0.04, 1.2, 3.5), 2)).toBe(false);
    expect(starsHideFriction(feature("Cleaning", 0.32, 1.6, 5), 2)).toBe(false);
  });
});

describe("reviewMismatch", () => {
  const review = (rating: number, score: number | null) => ({ rating, score }) as Review;
  it("catches stars and words that disagree", () => {
    expect(reviewMismatch(review(5, 0.2), 2)).toBe("words-worse");
    expect(reviewMismatch(review(1, 1.8), 2)).toBe("words-better");
    expect(reviewMismatch(review(5, 1.8), 2)).toBeNull();
    expect(reviewMismatch(review(5, null), 2)).toBeNull();
  });
});

describe("white-label copy", () => {
  it("never shows the server's message for service errors", () => {
    const text = errorMessage("LLM_UNAVAILABLE", "Jev rejected the API key.");
    expect(text).not.toMatch(/jev|groq|llm|api key/i);
  });

  it("passes through product and URL messages", () => {
    expect(errorMessage("INVALID_URL", "URL must be a daraz.pk product page.")).toBe("URL must be a daraz.pk product page.");
  });
});
