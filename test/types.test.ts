import { generateText, isStepCount, type ToolSet } from "ai";
import { mailramboTools } from "../index.js";

const free = mailramboTools({ apiKey: "mr_test_fixture", fetch, fastTimeoutMs: 2000 });
const tools: ToolSet = free;
// @ts-expect-error free defaults cannot expose paid mailbox verification
free.verifyMailbox;
const paid = mailramboTools({ apiKey: "mr_test_fixture", paidVerification: { maxChecks: 2, timeoutMs: 10000 } });
const paidTools: ToolSet = paid;
// @ts-expect-error budget is trusted numeric configuration
mailramboTools({ paidVerification: { maxChecks: "unlimited" } });
// @ts-expect-error mode is not a factory/model option
mailramboTools({ mode: "full" });

// Registry example: compile only; never call a billed provider in tests.
async function registryExample() {
  const { text } = await generateText({
    model: "openai/gpt-5-mini",
    prompt: "Screen jane@example.com for signup problems; explain whether the mailbox was checked.",
    tools: mailramboTools(),
    stopWhen: isStepCount(2),
  });
  return text;
}
void registryExample;
void tools;
void paidTools;
