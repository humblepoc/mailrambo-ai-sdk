import assert from "node:assert/strict";
import { test } from "node:test";
import { generateText, isStepCount } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { mailramboTools } from "../index.js";

const usage = { inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 0, text: 0, reasoning: 0 } };
const modelResponse = (content, unified = "stop") => ({ content, finishReason: { unified, raw: unified }, usage, warnings: [] });
const call = (toolName, input) => ({ type: "tool-call", toolCallId: "local-fixture-1", toolName, input: JSON.stringify(input) });
const email = "jane@example.com";

test("real AI SDK loop calls the free tool with no external inference", async () => {
  let apiCalls = 0;
  const tools = mailramboTools({ apiKey: "mr_test_fixture", fetch: async () => {
    apiCalls++;
    return Response.json({ email, mode: "fast", deliverable: null, reason: "fast_check_passed", suggestion: null,
      checks: { mx: true, disposable: false, role_account: false, free_email: false } });
  } });
  const model = new MockLanguageModelV4({ doGenerate: [
    modelResponse([call("screenSignupEmail", { email })], "tool-calls"),
    modelResponse([{ type: "text", text: "Screening passed; mailbox not checked." }]),
  ] });
  const response = await generateText({ model, tools, prompt: "Screen this signup email.", stopWhen: isStepCount(2), maxRetries: 0 });
  assert.equal(apiCalls, 1);
  assert.equal(model.doGenerateCalls.length, 2);
  assert.equal(response.steps[0].toolResults[0].output.mailboxChecked, false);
  assert.equal(response.steps[0].toolResults[0].output.deliverable, null);
  assert.equal(response.text, "Screening passed; mailbox not checked.");
});

test("real AI SDK loop stops for paid approval before any API request", async () => {
  let apiCalls = 0;
  const tools = mailramboTools({ apiKey: "mr_test_fixture", paidVerification: { maxChecks: 1 }, fetch: async () => { apiCalls++; throw new Error("must not execute"); } });
  const model = new MockLanguageModelV4({ doGenerate: modelResponse([call("verifyMailbox", { email })], "tool-calls") });
  const response = await generateText({ model, tools, prompt: "Verify this mailbox.", maxRetries: 0 });
  assert.equal(apiCalls, 0);
  assert.equal(response.content.some((part) => part.type === "tool-approval-request"), true);
});

test("real AI SDK rejects model attempts to select paid mode through the free tool", async () => {
  let apiCalls = 0;
  const tools = mailramboTools({ apiKey: "mr_test_fixture", fetch: async () => { apiCalls++; throw new Error("must not execute"); } });
  const model = new MockLanguageModelV4({ doGenerate: modelResponse([call("screenSignupEmail", { email, mode: "full" })], "tool-calls") });
  const response = await generateText({ model, tools, prompt: "Screen this signup email.", maxRetries: 0 });
  assert.equal(apiCalls, 0);
  assert.equal(response.steps[0].toolResults.length, 0);
  assert.equal(response.steps[0].content.filter((part) => part.type === "tool-error").length, 1);
});
