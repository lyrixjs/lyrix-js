import { TranslationError } from "../../core/errors";
import type { TranslationConfig } from "../../core/types";
import type { LyricsLine } from "../../providers/provider";
import { createTranslationClient } from "./client";
import { requestTranslation } from "./request";

const TRANSLATION_BATCH_SIZE = 12;

export async function translateLines(
	lines: string[],
	to: string,
	from: string | undefined,
	config: TranslationConfig,
): Promise<string[]> {
	if (to.trim().length === 0) {
		throw new TranslationError("A target language is required.");
	}

	const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
	if (nonEmptyLines.length === 0) return [...lines];

	const client = createTranslationClient(config);
	const translated: string[] = [];
	for (
		let index = 0;
		index < nonEmptyLines.length;
		index += TRANSLATION_BATCH_SIZE
	) {
		const batch = nonEmptyLines.slice(index, index + TRANSLATION_BATCH_SIZE);
		translated.push(...(await requestTranslation(batch, to, from, client)));
	}

	let cursor = 0;
	return lines.map((line) => {
		if (line.trim().length === 0) return line;
		const text = translated[cursor];
		cursor += 1;
		return text ?? line;
	});
}

export async function translateSyncedLines(
	lines: LyricsLine[],
	to: string,
	from: string | undefined,
	config: TranslationConfig,
): Promise<LyricsLine[]> {
	const translated = await translateLines(
		lines.map((line) => line.text),
		to,
		from,
		config,
	);

	return lines.map((line, index) => ({
		text: translated[index] ?? line.text,
		...(line.startTime === undefined ? {} : { startTime: line.startTime }),
	}));
}
