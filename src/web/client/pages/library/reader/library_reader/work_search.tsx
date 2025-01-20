/* istanbul ignore file */

// This isn't used yet.

import { assert, checkPresent } from "@/common/assert";
import { setMap } from "@/common/data_structures/collect_map";
import { processWords } from "@/common/text_cleaning";
import { XmlNode } from "@/common/xml/xml_node";
import { findTextNodes, type TextNodeData } from "@/common/xml/xml_text_utils";
import { SpanButton } from "@/web/client/components/generic/basics";
import { SearchBoxNoAutocomplete } from "@/web/client/components/generic/search";
import {
  navigateToSection,
  type PaginatedWork,
} from "@/web/client/pages/library/reader/library_reader/library_reader_common";
import { Router } from "@/web/client/router/router_v2";
import { useState } from "react";

function matchPageId(id: string[], work: PaginatedWork): string[] | undefined {
  for (let i = 0; i < work.pages.length; i++) {
    const page = work.pages[i];
    let isMatch = true;
    for (let j = 0; j < page.id.length; j++) {
      if (id[j] != page.id[j]) {
        isMatch = false;
        break;
      }
    }
    if (isMatch) {
      return work.pages[i].id;
    }
  }
}

function indexWork(work: PaginatedWork) {
  const index = setMap<string, string[]>();
  for (const [id, node] of work.rows) {
    const currentId = id;
    for (const textNode of findTextNodes(node)) {
      processWords(textNode.text, (w) => index.add(w.toLowerCase(), currentId));
    }
  }
  return index.map;
}

function findCandidateMatches(work: PaginatedWork, query: string[]) {
  const index = indexWork(work);
  let matches = index.get(query[0].toLowerCase()) ?? new Set();
  for (let i = 0; i < query.length; i++) {
    const wordMatches = index.get(query[i].toLowerCase()) ?? new Set();
    matches = new Set([...matches].filter((match) => wordMatches.has(match)));
  }
  return Array.from(matches.values());
}

/**
 * Finds instances of the sequence of words in the `query` within the `test`.
 */
function findTextQuery(
  query: string[],
  text: TextNodeData[]
): [number, number][] {
  const results: [number, number][] = [];
  let matchStart: number | undefined = undefined;
  let queryIndex: number = 0;
  for (let i = 0; i < text.length; i++) {
    // Skip anything not tagged as a Latin word.
    if (text[i].parent.name !== "libLat") {
      continue;
    }
    const expected = query[queryIndex].toLowerCase();
    if (text[i].text.toLowerCase() !== expected) {
      queryIndex = 0;
      matchStart = undefined;
      continue;
    }
    if (matchStart === undefined) {
      matchStart = i;
    }
    queryIndex++;
    if (queryIndex === query.length) {
      results.push([checkPresent(matchStart), i]);
      queryIndex = 0;
      matchStart = undefined;
    }
  }
  return results;
}

interface RawTextMatchResult {
  sectionId: string[];
  textIndices: [number, number];
  text: TextNodeData[];
}

function filterCandidateMatches(
  work: PaginatedWork,
  candidates: string[][],
  query: string[]
) {
  const results: RawTextMatchResult[] = [];
  const root = new XmlNode(
    "root",
    [],
    work.rows.map((r) => r[1])
  );
  const text = findTextNodes(root);
  for (const candidate of candidates) {
    const matches = findTextQuery(query, text);
    if (matches.length > 0) {
      results.push(
        ...matches.map((match) => ({
          text,
          sectionId: candidate,
          textIndices: match,
        }))
      );
    }
  }
  return results;
}

interface TextMatchResult {
  sectionId: string[];
  matchText: string;
  leftContext: string;
  rightContext: string;
}

function getTextContext(
  text: TextNodeData[],
  start: number,
  dir: 1 | -1
): string {
  const result: string[] = [];
  let wordsSeen = 0;
  for (let i = start + dir; 0 <= i && i < text.length; i += dir) {
    result.push(text[i].text);
    if (text[i].parent.name === "libLat") {
      wordsSeen++;
    }
    if (wordsSeen === 3) {
      break;
    }
  }
  if (dir < 0) {
    result.reverse();
  }
  return result.join("");
}

function transformRawTextMatch(raw: RawTextMatchResult): TextMatchResult {
  let matchText = "";
  for (let i = raw.textIndices[0]; i <= raw.textIndices[1]; i++) {
    matchText += raw.text[i].text;
  }
  return {
    sectionId: raw.sectionId,
    matchText,
    leftContext: getTextContext(raw.text, raw.textIndices[0], -1),
    rightContext: getTextContext(raw.text, raw.textIndices[1], 1),
  };
}

function findTextSearchMatches(work: PaginatedWork, query: string[]) {
  assert(query.length > 0);
  const candidates = findCandidateMatches(work, query);
  const matches = filterCandidateMatches(work, candidates, query);
  return matches.map(transformRawTextMatch);
}

export function TextSearchSection(props: { work: PaginatedWork }) {
  const [query, setQuery] = useState<string[]>([]);
  const [results, setResults] = useState<TextMatchResult[]>([]);
  const { nav } = Router.useRouter();

  return (
    <div>
      <SearchBoxNoAutocomplete
        onRawEnter={(value) => {
          const words = value
            .split(/[\s,.-]+/)
            .filter((word) => /^[\w\d]+$/.test(word));
          if (words.length === 0) {
            return;
          }
          setQuery(words);
          setResults(findTextSearchMatches(props.work, words));
        }}
        ariaLabel="search this work"
        autoFocused
      />
      {query.length > 0 && (
        <div>
          <span className="text sm light">Results for: </span>
          <span className="text sm">{query.join(" ")}</span>
        </div>
      )}
      {results.map((result, i) => (
        <SpanButton
          style={{ display: "block" }}
          key={i}
          onClick={() => {
            const newSection = matchPageId(result.sectionId, props.work);
            if (newSection === undefined) {
              return;
            }
            const line = parseInt(result.sectionId.slice(-1)[0]) - 1;
            navigateToSection(
              newSection.join("."),
              nav,
              props.work,
              line.toString()
            );
          }}>
          <span className="text light">[{result.sectionId.join(".")}] </span>
          {result.leftContext}
          <b>
            <span>{result.matchText}</span>
          </b>
          {result.rightContext}
        </SpanButton>
      ))}
      <div className="text sm light">
        Search for text within this work. Punctuation is ignored.
      </div>
    </div>
  );
}
