import { API_URL } from "@/src/config/backend";

export type CheckEmailResponse = { available: boolean };

export type SendSignupOtpResponse = {
  ok: boolean;
  message: string;
  expires_in: number;
  resend_after: number;
};

export type VerifySignupOtpResponse = {
  verification_token: string;
  expires_in: number;
};

type ApiErrorDetail =
  | string
  | { message?: string; retry_after?: number }
  | Array<{ msg?: string }>;

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { detail: text };
  }
}

export function formatSignupApiError(
  json: Record<string, unknown>,
  fallback: string,
): string {
  const detail = json.detail as ApiErrorDetail | undefined;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail) && detail.message) {
    return detail.message;
  }
  if (Array.isArray(detail)) {
    return detail[0]?.msg || fallback;
  }
  return fallback;
}

export function getRetryAfterSeconds(json: Record<string, unknown>): number | null {
  const detail = json.detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const retry = (detail as { retry_after?: number }).retry_after;
    return typeof retry === "number" ? retry : null;
  }
  return null;
}

async function signupPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Network error. Check your connection and try again.");
  }
  const json = await readJson(res);
  if (!res.ok) {
    const err = new Error(formatSignupApiError(json, "Request failed")) as Error & {
      status?: number;
      retryAfter?: number | null;
    };
    err.status = res.status;
    err.retryAfter = getRetryAfterSeconds(json);
    throw err;
  }
  return json as T;
}

export async function checkSignupEmail(email: string): Promise<CheckEmailResponse> {
  return signupPost<CheckEmailResponse>("/auth/check-email", { email });
}

export async function sendSignupOtp(email: string): Promise<SendSignupOtpResponse> {
  return signupPost<SendSignupOtpResponse>("/auth/send-signup-otp", { email });
}

export async function verifySignupOtp(email: string, code: string): Promise<VerifySignupOtpResponse> {
  return signupPost<VerifySignupOtpResponse>("/auth/verify-signup-otp", { email, code });
}
