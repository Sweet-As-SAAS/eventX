// structured() and modelFor() with the OpenAI SDK mocked: model names come from env at call time, never the network.
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const parse = vi.fn(async (req: { model: string }) => ({ model: req.model, choices: [{ message: { parsed: { ok: true }, refusal: null } }] }));
vi.mock("openai", () => ({ default: class { chat = { completions: { parse } }; } }));

const { modelFor, structured } = await import("../lib/ai/client");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  parse.mockClear();
});

describe("AI client", () => {
  it("reads model names from env at call time and throws when unset", () => {
    vi.stubEnv("OPENAI_MODEL_FAST", "");
    expect(() => modelFor("fast")).toThrow("OPENAI_MODEL_FAST");
    vi.stubEnv("OPENAI_MODEL_FAST", "test-fast");
    vi.stubEnv("OPENAI_MODEL_STRONG", "test-strong");
    expect([modelFor("fast"), modelFor("strong")]).toEqual(["test-fast", "test-strong"]);
  });

  it("sends the tier's env model and logs one timing line without prompt text", async () => {
    vi.stubEnv("OPENAI_MODEL_STRONG", "test-strong");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const schema = z.object({ ok: z.boolean() });
    await expect(structured({ schema, name: "probe", system: "s", user: "secret prompt", model: "strong" }))
      .resolves.toEqual({ ok: true });
    expect(parse.mock.calls[0][0].model).toBe("test-strong");
    expect(info).toHaveBeenCalledTimes(1);
    expect(String(info.mock.calls[0][0])).toMatch(/^\[ai\] probe test-strong \d+ms$/);
  });
});
