import { tool } from "ai";
import { z } from "zod";
import { MailRambo, MailRamboError } from "mailrambo";

const emailInput = z.object({ email: z.string().min(1).max(320) }).strict();
const emptyInput = z.object({}).strict();
const fastReasons = new Set(["invalid_syntax", "possible_typo", "disposable", "no_mx"]);
const fullReasons = new Set(["mailbox_exists", "role_account", "invalid_syntax", "disposable", "spamtrap",
  "inbox_full", "mailbox_disabled", "catch_all", "mailbox_not_found", "unverifiable", "no_mx", "possible_typo"]);
const safeErrors = new Set(["missing_api_key", "invalid_api_key", "api_key_revoked", "insufficient_credits",
  "subscription_inactive", "rate_limited", "provider_unavailable", "temporarily_unavailable", "invalid_request",
  "network_error"]);
const unavailable = (code, status = 0) => ({ ok: false, error: { code, status } });
const nonNegativeInt = (n) => Number.isSafeInteger(n) && n >= 0;
const matchesEmail = (result, email) => typeof result?.email === "string" &&
  result.email.toLowerCase() === email.trim().toLowerCase();

function validFast(result, email) {
  if (!matchesEmail(result, email) || result.mode !== "fast") return false;
  if (result.deliverable === null ? result.reason !== "fast_check_passed" :
    result.deliverable !== false || !fastReasons.has(result.reason)) return false;
  if (result.suggestion !== null && typeof result.suggestion !== "string") return false;
  if (result.checks === null) return result.reason === "invalid_syntax";
  return result.checks && typeof result.checks === "object" &&
    ["mx", "disposable", "role_account", "free_email"].every((k) => typeof result.checks[k] === "boolean");
}

function validFull(result, email) {
  if (!matchesEmail(result, email) || result.mode !== undefined || typeof result.deliverable !== "boolean" ||
      !fullReasons.has(result.reason)) return false;
  return result.deliverable === (result.reason === "mailbox_exists" || result.reason === "role_account");
}

function timeout(value, name) {
  if (!Number.isInteger(value) || value < 1 || value > 2_147_483_647) {
    throw new TypeError(`${name} must be a positive integer timeout in milliseconds (maximum 2147483647).`);
  }
  return value;
}

async function request(fn) {
  try { return { result: await fn() }; }
  catch (error) {
    return { failure: unavailable(error instanceof MailRamboError && safeErrors.has(error.code) ?
      error.code : "request_failed", error instanceof MailRamboError && Number.isInteger(error.status) ? error.status : 0) };
  }
}

/** Free-by-default tools; optional paid attempts are limited per factory instance. */
export function mailramboTools(options = {}) {
  const apiKey = options.apiKey ?? globalThis.process?.env?.MAILRAMBO_API_KEY;
  if (typeof apiKey !== "string" || !apiKey.trim()) throw new TypeError("Pass apiKey or set MAILRAMBO_API_KEY.");
  if (options.fetch !== undefined && typeof options.fetch !== "function") throw new TypeError("fetch must be a function.");
  const fastClient = new MailRambo({ apiKey, timeout: timeout(options.fastTimeoutMs ?? 2000, "fastTimeoutMs"),
    maxRetries: 0, fetch: options.fetch });
  const tools = {
    screenSignupEmail: tool({
      description: "Free syntax, typo, disposable and mail-domain screening of a signup email. Does NOT verify mailbox existence, ownership or identity. Returns false for known problems, null when no problem is found, and ok:false when unavailable. Never sends email or creates accounts.",
      inputSchema: emailInput,
      execute: async (input) => {
        const parsed = emailInput.safeParse(input);
        if (!parsed.success) return unavailable("invalid_input");
        const { result, failure } = await request(() => fastClient.verify(parsed.data.email, { mode: "fast" }));
        if (failure) return failure;
        if (!validFast(result, parsed.data.email)) return unavailable("invalid_response");
        return { ok: true, email: result.email, mode: "fast", deliverable: result.deliverable, reason: result.reason,
          suggestion: result.suggestion, checks: result.checks === null ? null : {
            mx: result.checks.mx, disposable: result.checks.disposable,
            role_account: result.checks.role_account, free_email: result.checks.free_email,
          }, mailboxChecked: false, simulation: false };
      },
    }),
    checkCredits: tool({
      description: "Inspect the authenticated MailRambo account's plan and credit balance for free. Does not purchase credits, change plans, or authorize paid calls.",
      inputSchema: emptyInput,
      execute: async (input) => {
        if (!emptyInput.safeParse(input).success) return unavailable("invalid_input");
        const { result, failure } = await request(() => fastClient.account());
        if (failure) return failure;
        if (typeof result?.plan !== "string" || !nonNegativeInt(result.credits_remaining) ||
            !nonNegativeInt(result.credits_total) || !nonNegativeInt(result.pack_credits ?? 0)) return unavailable("invalid_response");
        return { ok: true, plan: result.plan, creditsRemaining: result.credits_remaining,
          creditsTotal: result.credits_total, packCredits: result.pack_credits ?? 0 };
      },
    }),
  };

  if (options.paidVerification !== undefined) {
    const paid = options.paidVerification;
    if (!paid || typeof paid !== "object" || Array.isArray(paid)) throw new TypeError("paidVerification requires an explicit maxChecks configuration.");
    const maxChecks = paid.maxChecks;
    if (!Number.isSafeInteger(maxChecks) || maxChecks < 1) throw new TypeError("maxChecks must be a positive safe integer.");
    const fullClient = new MailRambo({ apiKey, timeout: timeout(paid.timeoutMs ?? 10000, "paidVerification.timeoutMs"),
      maxRetries: 0, fetch: options.fetch });
    let attempts = 0;
    tools.verifyMailbox = tool({
      description: "Full mailbox verification. May consume one MailRambo credit per request; requires host approval and a developer-configured local attempt limit. Catch-all/uncertain mailboxes are not confirmed. Test keys simulate full results. Does NOT prove ownership, identity or consent and never sends mail.",
      inputSchema: emailInput,
      needsApproval: true,
      execute: async (input) => {
        const parsed = emailInput.safeParse(input);
        if (!parsed.success) return unavailable("invalid_input");
        if (attempts >= maxChecks) return unavailable("paid_check_limit_reached");
        attempts++; // Reserve atomically before awaiting RPC; ambiguous failures keep the reservation.
        const { result, failure } = await request(() => fullClient.verify(parsed.data.email, { mode: "full" }));
        if (failure) return failure;
        if (!validFull(result, parsed.data.email) ||
            (result.credits_remaining != null && !nonNegativeInt(result.credits_remaining))) return unavailable("invalid_response");
        return { ok: true, email: result.email, mode: "full", deliverable: result.deliverable, reason: result.reason,
          creditsRemaining: result.credits_remaining ?? null, simulation: fullClient.isTestMode };
      },
    });
  }
  return tools;
}
