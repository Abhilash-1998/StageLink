/**
 * Lightweight unit checks for signup API helpers (run with: npx tsx src/services/signupApi.test.ts)
 */
import assert from "node:assert/strict";

import { formatSignupApiError, getRetryAfterSeconds } from "./signupApi";

assert.equal(formatSignupApiError({ detail: "Invalid or expired verification code." }, "fail"), "Invalid or expired verification code.");
assert.equal(
  formatSignupApiError({ detail: { message: "Please wait before requesting another code." } }, "fail"),
  "Please wait before requesting another code.",
);
assert.equal(getRetryAfterSeconds({ detail: { message: "wait", retry_after: 42 } }), 42);
assert.equal(getRetryAfterSeconds({ detail: "plain" }), null);

console.log("signupApi.test.ts: all assertions passed");
