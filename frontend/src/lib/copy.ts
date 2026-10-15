/**
 * All user-facing wording for pipeline stages and errors lives here.
 *
 * The UI is white-labelled: it never names the models or services behind it.
 * Backend messages can mention them, so for every error code we show our own
 * text and only fall back to the server's message for codes listed in
 * SAFE_SERVER_MESSAGES (URL and product problems, which never do).
 */
import type { Stage } from "@/lib/stream";

export const STAGE_COPY: Record<Stage, { label: string; working: string }> = {
  validating: { label: "Check link", working: "Checking the link" },
  scraping: { label: "Collect reviews", working: "Reading the product page and collecting reviews" },
  cleaning: { label: "Clean text", working: "Cleaning review text and removing duplicates" },
  categorizing: { label: "Find key features", working: "Working out which features matter for this product" },
  scoring: { label: "AI reads reviews", working: "AI is reading every review" },
  compiling: { label: "Compile insights", working: "Compiling trends, features and themes" },
};

const ERROR_COPY: Record<string, string> = {
  INVALID_URL: "That link isn't a Daraz.pk product page.",
  PRODUCT_NOT_FOUND: "We couldn't find that product. It may have been removed.",
  SCRAPE_BLOCKED: "Daraz is limiting requests right now. Please try again in a few minutes.",
  SCRAPE_TIMEOUT: "Daraz took too long to respond. Please try again shortly.",
  LLM_UNAVAILABLE: "Our AI analysis is temporarily unavailable. Please try again shortly.",
  LLM_OUTPUT_INVALID: "Our AI analysis couldn't finish for this product. Please try again.",
  RUN_NOT_FOUND: "That analysis is no longer available.",
  INTERNAL_ERROR: "Something went wrong while analysing this product. Please try again.",
  BACKEND_UNREACHABLE: "The analysis service is offline. Please try again shortly.",
  STREAM_LOST: "The connection was interrupted before the analysis finished. Please try again.",
};

const SAFE_SERVER_MESSAGES = new Set(["INVALID_URL", "PRODUCT_NOT_FOUND"]);

export function errorMessage(code: string, serverMessage?: string): string {
  if (serverMessage && SAFE_SERVER_MESSAGES.has(code)) return serverMessage;
  return ERROR_COPY[code] ?? "Something went wrong. Please try again.";
}

export const SCORE_NAME = "AI sentiment score";
