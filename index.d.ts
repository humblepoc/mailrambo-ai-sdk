import type { Tool } from "ai";
import type { Reason } from "mailrambo";

export interface MailRamboToolOptions {
  /** Server-side key; falls back to MAILRAMBO_API_KEY. */
  apiKey?: string;
  /** Default 2000ms. Zero retries. */
  fastTimeoutMs?: number;
  /** Must honor AbortSignal. Use injected mocks for cost-free tests. */
  fetch?: typeof fetch;
  /** Omit for free tools only. Trusted server configuration, never model inputs. */
  paidVerification?: {
    /** Maximum full-check attempts per returned toolset, including failed requests. Not a global/durable cap. */
    maxChecks: number;
    /** Default 10000ms. Zero retries. */
    timeoutMs?: number;
  };
}
export interface ToolFailure { ok: false; error: { code: string; status: number }; }
export interface SignupScreen {
  ok: true;
  email: string;
  mode: "fast";
  deliverable: false | null;
  reason: Reason;
  suggestion: string | null;
  checks: { mx: boolean; disposable: boolean; role_account: boolean; free_email: boolean } | null;
  mailboxChecked: false;
  simulation: false;
}
export interface CreditBalance { ok: true; plan: string; creditsRemaining: number; creditsTotal: number; packCredits: number; }
export interface MailboxResult { ok: true; email: string; mode: "full"; deliverable: boolean; reason: Reason; creditsRemaining: number | null; simulation: boolean; }
export type FreeMailRamboTools = {
  screenSignupEmail: Tool<{ email: string }, SignupScreen | ToolFailure>;
  checkCredits: Tool<Record<string, never>, CreditBalance | ToolFailure>;
};
export type PaidMailRamboTools = FreeMailRamboTools & {
  /** AI SDK approval required. Direct execute calls need caller-enforced approval policy. */
  verifyMailbox: Tool<{ email: string }, MailboxResult | ToolFailure>;
};
export declare function mailramboTools(options: MailRamboToolOptions & { paidVerification: NonNullable<MailRamboToolOptions["paidVerification"]> }): PaidMailRamboTools;
export declare function mailramboTools(options?: Omit<MailRamboToolOptions, "paidVerification"> & { paidVerification?: undefined }): FreeMailRamboTools;
