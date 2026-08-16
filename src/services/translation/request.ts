import { z } from "zod";
import type { ChatOpenAI } from "@langchain/openai";
import { buildUserPrompt, SYSTEM_PROMPT } from "./prompt";

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 250;

export async function requestTranslation(
	lines: string[],
	to: string,
	from: string | undefined,
	client: ChatOpenAI,
): Promise<string[]> {
	const schema = z.object({
		lines: z.array(z.string()).length(lines.length),
	});
	const structuredClient = client.withStructuredOutput(schema, {
		name: "translated_lyrics",
		strict: true,
	});
	const messages = [
		{ role: "system" as const, content: SYSTEM_PROMPT },
		{ role: "user" as const, content: buildUserPrompt(lines, to, from) },
	];

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
		try {
			const result = await structuredClient.invoke(messages);
			return result.lines;
		} catch {
			if (attempt === MAX_ATTEMPTS) break;
			await new Promise((resolve) =>
				setTimeout(resolve, RETRY_DELAY_MS * attempt),
			);
		}
	}

	// Translation is optional; preserve the source when the provider cannot
	// satisfy the exact schema after retries.
	return [...lines];
}
