import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { afterEach, mock, test } from "node:test";
import { TranslationError } from "../../dist/core/errors.js";
import { createTranslationClient } from "../../dist/services/translation/client.js";
import {
	translateLines,
	translateSyncedLines,
} from "../../dist/services/translation/lines.js";
import {
	buildUserPrompt,
	SYSTEM_PROMPT,
} from "../../dist/services/translation/prompt.js";
import { requestTranslation } from "../../dist/services/translation/request.js";
import { parseTranslatedLines } from "../../dist/services/translation/response.js";
import { TranslationService } from "../../dist/services/translation/service.js";

const require = createRequire(import.meta.url);
const { ChatOpenAI } = require("@langchain/openai");

afterEach(() => mock.restoreAll());

const sampleConfig = {
	apiKey: "test-api-key",
	model: "gpt-4o-mini",
};

test("createTranslationClient validates apiKey and model", () => {
	assert.throws(
		() => createTranslationClient({ apiKey: "", model: "gpt-4o" }),
		(err) =>
			err instanceof TranslationError &&
			err.message.includes("API key is required"),
	);

	assert.throws(
		() => createTranslationClient({ apiKey: "  ", model: "gpt-4o" }),
		(err) => err instanceof TranslationError,
	);

	assert.throws(
		() => createTranslationClient({ apiKey: "key", model: "" }),
		(err) =>
			err instanceof TranslationError &&
			err.message.includes("model is required"),
	);

	assert.throws(
		() => createTranslationClient({ apiKey: "key", model: "   " }),
		(err) => err instanceof TranslationError,
	);
});

test("createTranslationClient instantiates ChatOpenAI with config and baseUrl", () => {
	const client = createTranslationClient({
		...sampleConfig,
		baseUrl: "https://custom.endpoint/v1",
	});

	assert.ok(client);
	assert.equal(client.model, "gpt-4o-mini");
	assert.equal(client.temperature, 0);
	assert.equal(client.clientConfig.baseURL, "https://custom.endpoint/v1");
});

test("buildUserPrompt formats prompts with and without source language", () => {
	const promptWithSource = buildUserPrompt(["Hello", "World"], "es", "en");
	assert.match(
		promptWithSource,
		/Translate the following song lyrics from en to es\./,
	);
	assert.match(promptWithSource, /Keep exactly 2 lines in the same order/);
	assert.match(promptWithSource, /"Hello"/);
	assert.match(promptWithSource, /"World"/);

	const promptWithoutSource = buildUserPrompt(["Hello"], "fr");
	assert.match(
		promptWithoutSource,
		/Translate the following song lyrics to fr\./,
	);
	assert.match(promptWithoutSource, /Keep exactly 1 lines in the same order/);

	assert.ok(SYSTEM_PROMPT.includes("professional lyrics translator"));
});

test("parseTranslatedLines parses valid JSON and throws on malformed payloads", () => {
	const parsed = parseTranslatedLines('{"lines": ["Hola", "Mundo"]}', 2);
	assert.deepEqual(parsed, ["Hola", "Mundo"]);

	assert.throws(
		() => parseTranslatedLines("not json", 2),
		(err) =>
			err instanceof TranslationError && err.message.includes("invalid JSON"),
	);

	assert.throws(
		() => parseTranslatedLines('{"notLines": []}', 2),
		(err) =>
			err instanceof TranslationError &&
			err.message.includes('missing the "lines" array'),
	);

	assert.throws(
		() => parseTranslatedLines('{"lines": "string"}', 2),
		(err) =>
			err instanceof TranslationError &&
			err.message.includes('missing the "lines" array'),
	);

	assert.throws(
		() => parseTranslatedLines('{"lines": ["Uno"]}', 2),
		(err) =>
			err instanceof TranslationError && err.message.includes("expected 2"),
	);

	assert.throws(
		() => parseTranslatedLines('{"lines": ["Uno", 42]}', 2),
		(err) =>
			err instanceof TranslationError &&
			err.message.includes("non-string line"),
	);
});

test("requestTranslation invokes structured output client and returns lines", async () => {
	let invocationCount = 0;
	let requestedMessages;

	const fakeStructuredClient = {
		invoke: async (messages) => {
			invocationCount += 1;
			requestedMessages = messages;
			return { lines: ["Ligne un", "Ligne deux"] };
		},
	};

	const fakeClient = {
		withStructuredOutput: (_schema, options) => {
			assert.equal(options.name, "translated_lyrics");
			assert.equal(options.strict, true);
			return fakeStructuredClient;
		},
	};

	const result = await requestTranslation(
		["Line one", "Line two"],
		"fr",
		"en",
		fakeClient,
	);

	assert.equal(invocationCount, 1);
	assert.deepEqual(result, ["Ligne un", "Ligne deux"]);
	assert.equal(requestedMessages.length, 2);
	assert.equal(requestedMessages[0].role, "system");
	assert.equal(requestedMessages[1].role, "user");
});

test("requestTranslation retries on error and falls back to original lines", async () => {
	let attempts = 0;
	const failingStructuredClient = {
		invoke: async () => {
			attempts += 1;
			throw new Error("API rate limit or connection timeout");
		},
	};

	const fakeClient = {
		withStructuredOutput: () => failingStructuredClient,
	};

	const lines = ["Line 1", "Line 2"];
	const result = await requestTranslation(lines, "es", undefined, fakeClient);

	assert.equal(attempts, 3);
	assert.deepEqual(result, lines);
	assert.notEqual(result, lines);
});

test("requestTranslation succeeds on a retry attempt", async () => {
	let attempts = 0;
	const retryStructuredClient = {
		invoke: async () => {
			attempts += 1;
			if (attempts < 2) {
				throw new Error("Transient error");
			}
			return { lines: ["Línea 1", "Línea 2"] };
		},
	};

	const fakeClient = {
		withStructuredOutput: () => retryStructuredClient,
	};

	const result = await requestTranslation(
		["Line 1", "Line 2"],
		"es",
		undefined,
		fakeClient,
	);

	assert.equal(attempts, 2);
	assert.deepEqual(result, ["Línea 1", "Línea 2"]);
});

test("translateLines throws if target language is empty", async () => {
	await assert.rejects(
		() => translateLines(["Hello"], "", undefined, sampleConfig),
		(err) =>
			err instanceof TranslationError &&
			err.message.includes("A target language is required"),
	);

	await assert.rejects(
		() => translateLines(["Hello"], "   ", undefined, sampleConfig),
		(err) => err instanceof TranslationError,
	);
});

test("translateLines returns empty or whitespace-only lines without calling translation client", async () => {
	const emptyResult = await translateLines([], "es", undefined, sampleConfig);
	assert.deepEqual(emptyResult, []);

	const blankResult = await translateLines(
		["", "   ", "\n"],
		"es",
		undefined,
		sampleConfig,
	);
	assert.deepEqual(blankResult, ["", "   ", "\n"]);
});

test("translateLines preserves empty lines at original positions and batches calls", async () => {
	const inputLines = [
		"",
		"Line 1",
		"Line 2",
		"Line 3",
		"Line 4",
		"   ",
		"Line 5",
		"Line 6",
		"Line 7",
		"Line 8",
		"Line 9",
		"Line 10",
		"Line 11",
		"Line 12",
		"Line 13",
		"",
	];

	const batchesReceived = [];
	mock.method(ChatOpenAI.prototype, "withStructuredOutput", () => ({
		invoke: async (messages) => {
			const userPrompt = messages[1].content;
			const jsonStart = userPrompt.indexOf('{\n  "lines":');
			const { lines } = JSON.parse(userPrompt.slice(jsonStart));
			batchesReceived.push(lines);
			return { lines: lines.map((l) => `Translated ${l}`) };
		},
	}));

	const result = await translateLines(inputLines, "es", "en", sampleConfig);

	assert.equal(batchesReceived.length, 2);
	assert.equal(batchesReceived[0].length, 12);
	assert.equal(batchesReceived[1].length, 1);

	assert.equal(result[0], "");
	assert.equal(result[1], "Translated Line 1");
	assert.equal(result[5], "   ");
	assert.equal(result[6], "Translated Line 5");
	assert.equal(result[14], "Translated Line 13");
	assert.equal(result[15], "");
});

test("translateSyncedLines maintains timestamps and maps translated texts", async () => {
	const syncedLines = [
		{ text: "First line", startTime: 1.25 },
		{ text: "Second line", startTime: 3.5 },
		{ text: "Untimed line" },
	];

	mock.method(ChatOpenAI.prototype, "withStructuredOutput", () => ({
		invoke: async () => ({
			lines: ["Primera línea", "Segunda línea", "Línea sin tiempo"],
		}),
	}));

	const result = await translateSyncedLines(
		syncedLines,
		"es",
		"en",
		sampleConfig,
	);

	assert.deepEqual(result, [
		{ text: "Primera línea", startTime: 1.25 },
		{ text: "Segunda línea", startTime: 3.5 },
		{ text: "Línea sin tiempo" },
	]);
});

test("TranslationService static methods delegate correctly", async () => {
	mock.method(ChatOpenAI.prototype, "withStructuredOutput", () => ({
		invoke: async () => ({
			lines: ["Traduit"],
		}),
	}));

	const linesRes = await TranslationService.translateLines(
		["Line"],
		"fr",
		undefined,
		sampleConfig,
	);
	assert.deepEqual(linesRes, ["Traduit"]);

	const syncedRes = await TranslationService.translateSyncedLines(
		[{ text: "Line", startTime: 1.0 }],
		"fr",
		undefined,
		sampleConfig,
	);
	assert.deepEqual(syncedRes, [{ text: "Traduit", startTime: 1.0 }]);
});
