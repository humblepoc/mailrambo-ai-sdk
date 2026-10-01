# MailRambo tools for Vercel AI SDK

Native, server-side email-quality tools for AI SDK agents. **Version 0.1.0.** Tested with **ai 7.0.126**, Zod 4.5.4, mailrambo 0.2.1 and Node 22.23.3/26.7.0. The `ai` peer is intentionally pinned to the tested release. Check compatibility before upgrading an existing app or forcing peer dependencies.

[Dedicated AI SDK integration guide](https://humblepoc.github.io/mailrambo-ai-sdk/) · [MailRambo API documentation](https://www.mailrambo.com/developers)

## Free by default

`mailramboTools()` exposes only:

| Tool | MailRambo API cost | What it establishes |
|---|---|---|
| `screenSignupEmail` | No verification credits | Syntax, typo, disposable and mail-domain problems; **not mailbox existence** |
| `checkCredits` | No verification credits | Current authenticated plan/credit balance |

`verifyMailbox` is **absent** unless a developer explicitly supplies a paid-check limit. The package never sends emails, creates accounts, purchases credits, changes plans or mines contacts.

No separate package fee or hosted backend is required. **LLM inference and your app hosting may cost money independently**; free MailRambo checks do not make a live model call free. Development tests use a mock model/fetch and need no provider key, wallet or real MailRambo key.

## Install and credentials

Install in a compatible server-side project:

```sh
npm install mailrambo-ai-sdk@0.1.0 ai@7.0.126 zod@4.5.4
```

For existing apps, verify compatibility first rather than blindly changing their `ai` dependency. Create a dedicated key at [MailRambo API Keys](https://www.mailrambo.com/api-keys), then set `MAILRAMBO_API_KEY` in your **server** environment. Never use a browser-exposed environment variable or pass credentials as model inputs.

```js
import { mailramboTools } from 'mailrambo-ai-sdk';

const tools = mailramboTools(); // Reads server-side MAILRAMBO_API_KEY.
```

### Use in an agent

```js
import { generateText, isStepCount } from 'ai';
import { mailramboTools } from 'mailrambo-ai-sdk';

const { text } = await generateText({
  model: 'openai/gpt-5-mini', // Requires provider/gateway access; inference may be billed.
  prompt: 'Screen jane@example.com for signup problems; explain whether the mailbox was checked.',
  tools: mailramboTools(),
  stopWhen: isStepCount(2),
});

console.log(text);
```

**Do not run this live model example on a $0 testing budget.** The same registration/loop is tested with `MockLanguageModelV4` from `ai/test` in this repository. No live inference is needed to verify the integration.

### Direct execution without a model

From trusted server code, you can execute the free tool without any model provider:

```js
const tools = mailramboTools();
const result = await tools.screenSignupEmail.execute(
  { email: 'jane@example.com' },
  { toolCallId: 'server-screen-1', messages: [] },
);
```

This still calls the MailRambo API and is subject to authentication, rate limits and your own hosting/network costs. It does not charge verification credits. For completely offline/cost-free tests, inject `fetch` and use local fixtures as the test suite does.

## Results and failure policy

Successful screening returns `ok:true`, `mode:'fast'`, `deliverable:false|null`, a reason, suggestion/checks, `mailboxChecked:false` and `simulation:false`. False means a known screening failure; null with `fast_check_passed` means no problem found, **not** a verified mailbox. Role and free-provider flags alone do not reject a signup. There is no silent typo correction or address rewriting.

API/network/timeout/unusable-response failures return **`ok:false`** with a sanitized error code/status, and no deliverability claim. Do not report failed screening as a successful pass. Your host app chooses whether signup continues on unavailable screening; keep normal email confirmation and abuse controls. This tool is not the separate [Better Auth plugin](https://www.mailrambo.com/blog/block-disposable-emails-better-auth), which has its own documented fail-open signup policy.

Both live and test keys run real fast checks. Full-mode checks with test keys are simulated and the optional tool returns `simulation:true`. Neither mailbox verification nor screening establishes identity, ownership or consent.

## Optional full verification—explicitly paid-capable

**For $0 verification-credit usage, omit this option entirely.** Enabling it is a developer decision, not something the model can request through input fields:

```js
const tools = mailramboTools({
  paidVerification: { maxChecks: 2, timeoutMs: 10000 },
});
// Adds tools.verifyMailbox; AI SDK requests approval before executing it.
```

- A full check can consume **one MailRambo credit**. Some API answers/repeats are free, but the local limit conservatively counts every attempted request.
- `needsApproval:true` is enforced by the AI SDK host loop. **Direct `.execute()` calls bypass that loop; the caller must enforce approval.** Do not expose direct paid execution to untrusted callers.
- The `maxChecks` counter is **per returned toolset instance, in memory**. Create one per bounded session and reuse it. Recreating a toolset, restarting the process or using other workers resets/duplicates the budget; it is **not a durable/global account spending cap**. Production hosts must enforce shared spending policy if needed.
- A slot is reserved before awaiting RPC, so parallel calls cannot exceed that instance's cap. Errors/timeouts retain reservations because charging may be ambiguous. It does not buy credits or enforce dollar limits for model/hosting costs.
- No automatic retries are performed, including paid requests. Catch-all and uncertain full results remain `deliverable:false`.
- Approval and the local limit are defense-in-depth, not a guarantee that an arbitrary host, custom fetch or app will enforce every spending policy.

## Options, privacy and limits

| Option | Default |
|---|---|
| `apiKey` | Server-side `MAILRAMBO_API_KEY` |
| `fastTimeoutMs` | 2000 ms, used for screening and balance requests |
| `fetch` | Built-in server fetch; custom fetch must honor `AbortSignal` |
| `paidVerification` | Omitted—no paid tool |
| `paidVerification.maxChecks` | Required positive safe integer if enabled |
| `paidVerification.timeoutMs` | 10000 ms |

Missing key/invalid options fail at startup. Remote timeouts do not guarantee total model/app latency. Email tool input is a nonempty string up to 320 characters; exact syntax is screened by the API. Schemas reject extra keys including mode/credentials/budget; direct execution validates them too.

Screening sends the email address to MailRambo over HTTPS. Review privacy policies and data-sharing requirements. The package does not log keys or addresses and does not expose raw upstream error text. Your app/model/provider logging can still retain tool inputs/outputs—configure it appropriately. Do not use results as proof of identity or replace CAPTCHA, rate limits or email confirmation.

## Development

```sh
npm ci --ignore-scripts
npm test
npm run typecheck
npm run pack:check
```

Tests call only injected fixtures and AI SDK mock models. Paid-tool tests do not make live mailbox requests. npm/GitHub publication is separate from registry acceptance. No official Vercel endorsement or first-place ranking is claimed.

[MailRambo API docs](https://www.mailrambo.com/developers) · [Pricing](https://www.mailrambo.com/pricing) · [Source/issues](https://github.com/humblepoc/mailrambo-ai-sdk)
