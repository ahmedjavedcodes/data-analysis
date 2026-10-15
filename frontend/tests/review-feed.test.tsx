import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { ReviewFeed } from "@/components/analysis/review-feed";
import { AnalysisResult } from "@/lib/schemas";

import fixture from "./fixtures/analysis.json";

const data = AnalysisResult.parse(fixture);

function Harness() {
  const [feature, setFeature] = useState<string | null>(null);
  return (
    <ReviewFeed
      reviews={data.reviews}
      featureNames={data.features.map((f) => f.name)}
      scale={data.scale}
      feature={feature}
      onFeatureChange={setFeature}
    />
  );
}

/** The review items only: direct children of the review <ol>, not the feature chips nested inside them. */
const listedReviews = () => Array.from(document.querySelectorAll<HTMLLIElement>("ol > li"));

describe("ReviewFeed", () => {
  it("shows the lowest Jev score first, 20 at a time", () => {
    render(<Harness />);
    expect(screen.getByText("78 reviews")).toBeInTheDocument();
    expect(screen.getByText("delivery rider buhat ziada badtamez hai..")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show 20 more" })).toBeInTheDocument();
  });

  it("filters by sentiment, feature and text", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const negatives = data.reviews.filter((r) => r.sentiment === "negative").length;

    await user.click(screen.getByRole("button", { name: "Negative" }));
    expect(screen.getByText(`${negatives} of 78 reviews`)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "All" }));
    await user.selectOptions(screen.getByLabelText("Feature"), "Packaging");
    const packaging = data.reviews.filter((r) => r.features.some((f) => f.name === "Packaging")).length;
    expect(screen.getByText(`${packaging} of 78 reviews mentioning Packaging`)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await user.type(screen.getByRole("searchbox"), "delivery");
    expect(await screen.findByText(/of 78 reviews$/)).toBeInTheDocument();
    for (const item of listedReviews()) {
      expect(item.textContent?.toLowerCase()).toContain("delivery");
    }
  });

  it("shows only reviews whose stars and words disagree", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("checkbox", { name: "Stars and words disagree" }));
    const items = listedReviews();
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item).toHaveTextContent(/but the words read/);
    }
  });
});
