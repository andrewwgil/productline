export const isOpenAIConfigured = () => Boolean(process.env.OPENAI_API_KEY);
export const openAIModel = () => process.env.OPENAI_MODEL || "gpt-5.5";

export type OpenAIContent =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail: "low" | "high" | "auto" } };

/** One Chat Completions call that must return JSON matching `schema` (strict structured output). */
export async function chatJSON<T>(system: string, content: OpenAIContent[], name: string, schema: Record<string, unknown>): Promise<T> {
  const model = openAIModel();
  const reasoning = /^(gpt-5|o\d)/i.test(model);
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, { role: "user", content }],
      response_format: { type: "json_schema", json_schema: { name, strict: true, schema } },
      ...(reasoning ? { reasoning_effort: "low" } : {}),
    }),
    signal: AbortSignal.timeout(110_000),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const data = await res.json();
  const message = data.choices?.[0]?.message;
  if (message?.refusal) throw new Error(`OpenAI declined: ${message.refusal}`);
  return JSON.parse(message?.content ?? "") as T;
}
