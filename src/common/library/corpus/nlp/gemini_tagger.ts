import { processTokens } from "@/common/text_cleaning";
import { crunchWord } from "@/morceus/crunch";
import { MorceusTables } from "@/morceus/cruncher_tables";
import { CruncherOptions } from "@/morceus/cruncher_types";
import { InflectionContext } from "@/morceus/inflection_data_utils";

type GeminiModel =
  | "gemini-3-pro-preview"
  | "gemini-2.5-pro"
  | "gemini-2.5-flash-lite";

interface GeminiContent {
  parts: Array<{ text: string }>;
  role?: string;
}

interface GeminiRequest {
  contents: GeminiContent[];
  systemInstruction?: GeminiContent;
  generationConfig?: {
    responseMimeType?: string;
    // See https://ai.google.dev/gemini-api/docs/structured-output?example=recipe#json_schema_support
    responseSchema?: object;
  };
}

interface GeminiResponse {
  candidates: Array<{
    content: GeminiContent;
    finishReason: string;
    index: number;
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
  usageMetadata: object;
  modelVersion: string;
  responseId: string;
}

function geminiRequest(
  prompt: string,
  schema?: object,
  systemInstruction?: string
): GeminiRequest {
  let config: GeminiRequest["generationConfig"] | undefined = undefined;
  if (schema !== undefined) {
    config = {
      responseMimeType: "application/json",
      responseSchema: schema,
    };
  }
  let systemInstructionContent: GeminiContent | undefined = undefined;
  if (systemInstruction !== undefined) {
    systemInstructionContent = {
      parts: [{ text: systemInstruction }],
    };
  }
  return {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: config,
    systemInstruction: systemInstructionContent,
  };
}

async function callGemini(
  request: GeminiRequest,
  apiKey: string,
  model: GeminiModel = "gemini-2.5-flash-lite"
): Promise<GeminiResponse> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Gemini API request failed: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const data = (await response.json()) as GeminiResponse;
  if (data.promptFeedback?.blockReason) {
    throw new Error(`Prompt blocked: ${data.promptFeedback.blockReason}`);
  }
  if (!data.candidates || data.candidates.length === 0) {
    throw new Error("No response generated from Gemini");
  }

  return data;
}

type TokenData = [string, string[]];

function disambigRequest(data: TokenData[]): GeminiRequest {
  const prompt = JSON.stringify(data);
  const systemInstruction = `You will recieve the text of a work in the Latin language
in the form of a JSON array of tuples. Each tuple has two elements.
1. The first is the text of the word or punctuation.
  a. Spaces will be omitted.
2. The second is a list of possible inflections for that word.
  a. If there is a choice to be made between lemmata, there will be a prefix "lem:" before the lemma value.
  b. If the word is punctuation or indeclinable, the list will be empty.

Your task is to provide the most likely inflection for each word based on Latin grammar and context.
If the list of possible inflection values is empty, return 0 for that word.
For each item in the input array, determine the index (0-based) of the most likely inflection from the provided list.

Respond with a space-delimited list of numbers, where each number corresponds to the index of the chosen inflection.
`;
  return geminiRequest(prompt, undefined, systemInstruction);
}

async function findBestInflections(
  data: TokenData[],
  highQuality: boolean = false
) {
  const request = disambigRequest(data);
  const response = await callGemini(
    request,
    process.env.GEMINI_API_KEY!,
    highQuality ? "gemini-3-pro-preview" : "gemini-2.5-flash-lite"
  );
  const content = response.candidates[0].content.parts[0].text;
  const options = content
    .trim()
    .split(/\s+/)
    .map((s) => parseInt(s, 10));
  if (options.length !== data.length) {
    throw new Error(
      `Expected ${data.length} options but got ${options.length}`
    );
  }
  for (let i = 0; i < options.length; i++) {
    const [token, inflections] = data[i];
    if (inflections.length === 0) {
      console.log(token);
      continue;
    }
    const selected = inflections[options[i]];
    console.log(token.padEnd(15), selected.padEnd(30), inflections);
  }
}

function tokenizeText(text: string): TokenData[] {
  const tables = MorceusTables.CACHED.get();
  const options = CruncherOptions.DEFAULT;
  const cruncher = (word: string) => crunchWord(word, tables, options);

  const result: TokenData[] = [];
  for (const [token, isWord] of processTokens(text)) {
    if (!isWord) {
      if (token.trim().length !== 0) {
        result.push([token, []]);
      }
      continue;
    }
    const options = cruncher(token);
    result.push([token, options.map((opt) => InflectionContext.toString(opt))]);
  }
  console.log(`Tokenized to ${result.length} tokens`);
  console.log(JSON.stringify(result, null, 2));
  return result;
}

const SAMPLE_TEXT = `
Gallia est omnis divisa in partes tres, quarum unam incolunt Belgae, aliam Aquitani, tertiam qui ipsorum lingua Celtae, nostra Galli appellantur.
Hi omnes lingua, institutis, legibus inter se differunt. Gallos ab Aquitanis Garumna flumen, a Belgis Matrona et Sequana dividit.`;

findBestInflections(tokenizeText(SAMPLE_TEXT), true);
