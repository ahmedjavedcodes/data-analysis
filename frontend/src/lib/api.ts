import { z } from "zod";

import { AnalysisResult, ApiErrorBody, RunSummary } from "@/lib/schemas";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...init, cache: "no-store" });
  } catch {
    throw new ApiError("BACKEND_UNREACHABLE", `Could not reach the analysis service at ${API_BASE_URL}.`, 0);
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = ApiErrorBody.safeParse(body);
    if (parsed.success) {
      throw new ApiError(parsed.data.error.code, parsed.data.error.message, response.status);
    }
    throw new ApiError(`HTTP_${response.status}`, `The analysis service answered ${response.status}.`, response.status);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(
      "BAD_RESPONSE",
      `The analysis service returned an unexpected shape: ${z.prettifyError(parsed.error).slice(0, 300)}`,
      response.status,
    );
  }
  return parsed.data;
}

export function getRun(runId: string): Promise<AnalysisResult> {
  return request(`/api/v1/runs/${encodeURIComponent(runId)}`, AnalysisResult);
}

export function listRuns(): Promise<RunSummary[]> {
  return request("/api/v1/runs", z.array(RunSummary));
}

/** Server-Sent Events stream of a new analysis (see src/lib/stream.ts). */
export function analysisStreamUrl(productUrl: string): string {
  return `${API_BASE_URL}/api/v1/analyze/stream?product_url=${encodeURIComponent(productUrl)}`;
}
