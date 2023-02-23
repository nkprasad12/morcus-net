import abc
import os
import re
import time
from typing import Optional

import json

from src.py.utils import data
from src.py.utils import perseus_parser

_SOURCE_ROOT = "texts/latin"


_PERSON_DICT = {
    "first": "1",
    "second": "2",
    "third": "3",
    "psor": "-",
}

_NUMBER_DICT = {
    "singular": "s",
    "plural": "p",
}

_VOICE_DICT = {
    "active": "a",
    "passive": "p",
}

_GENDER_DICT = {
    "masculine": "m",
    "feminine": "f",
    "neuter": "n",
}

_CASE_DICT = {
    "nominative": "n",
    "vocative": "v",
    "accusative": "a",
    "genitive": "g",
    "dative": "d",
    "ablative": "b",
    "locative": "l",
}

_DEGREE_DICT = {
    "positive": "-",
    "comparative": "c",
    "superlative": "s",
    "absolute_superlative": "s",
}

_TENSE_DICT = {
    "present": "p",
    "imperfect": "i",
    "future": "f",
    "perfect": "r",
    "pluperfect": "l",
    "future_perfect": "t",
    "past": "past",
}

_MOOD_DICT = {
    "indicative": "i",
    "subjunctive": "s",
    "imperative": "m",
    "infinitive": "n",
    "participle": "p",
    "gerund": "d",
    "gerundive": "g",
    "supine": "u",
}


class Pipeline(abc.ABC):
    def __init__(
        self,
        source_root: str = _SOURCE_ROOT,
        source_filter: str = r"lat\d\.xml",
        version_tag: Optional[str] = None,
        max_segments: Optional[int] = None,
        debug: bool = False,
    ):
        self._source_root = source_root
        self._source_filter = source_filter
        self._version_tag = version_tag
        self._max_segments = max_segments
        self._debug = debug
        if debug:
            self._source_filter = "phi0448.phi001.perseus-lat2.xml"
            self._version_tag = "debug"
            self._max_segments = 1 if max_segments is None else max_segments

    def initialize(self) -> None:
        """Initialize shared state, for example for the processer."""

    @abc.abstractmethod
    def process_text(self, text_part: data.TextPart) -> data.ProcessedPart:
        """Processes the input text."""

    def parse(self, source_file: str) -> "list[data.TextPart]":
        """The pipeline section for parsing files from disk."""
        print(f"Parsing file: {source_file}")
        return perseus_parser.parse_perseus_xml(source_file)

    def store(self, source_file: str, result: "list[data.ProcessedPart]") -> None:
        base = "processed_texts"
        if self._version_tag is not None:
            base = os.path.join(base, self._version_tag)
        dest_file = os.path.join(base, source_file)
        print(f"Writing to: {dest_file}")

        os.makedirs(os.path.dirname(dest_file), exist_ok=True)
        with open(dest_file, "w+") as f:
            json.dump(result, f, cls=data.JSONEncoder, ensure_ascii=False, indent=2)

    def _process_document(self, source_file: str) -> None:
        print(f"====================")
        print(f"Processing {source_file}")
        parts = self.parse(source_file)
        if self._max_segments is not None:
            print(f"Processing only {self._max_segments} segment(s)")
            parts = parts[: self._max_segments]
        results = []
        start_time = time.time()
        for i, part in enumerate(parts):
            results.append(self.process_text(part))
            print(f"\nPart {i + 1} of {len(parts)} completed.")
            elapsed = time.time() - start_time
            print(f"Elapsed time: {elapsed} seconds.")
            print(f"Expected time: {elapsed * len(parts) / (i + 1)} seconds")
        self.store(source_file, results)
        print(f"====================")

    def run(self) -> None:
        print("Running pipeline initialization")
        self.initialize()

        print(f"Finding files from {self._source_root} matching {self._source_filter}")
        pattern = re.compile(self._source_filter)
        for root, _, files in os.walk(self._source_root):
            for file in files:
                if not re.search(pattern, file):
                    continue
                full_path = os.path.join(root, file)
                self._process_document(full_path)


class Alatius(Pipeline):
    def initialize(self) -> None:
        # pytype: disable=import-error
        from src.libs.latin_macronizer.macronizer_modified import Macronizer

        # pytype: enable=import-error
        self._macronizer = Macronizer()

    def process_text(self, text_part: data.TextPart) -> data.ProcessedPart:
        result = self._macronizer.macronize(text_part.text)
        return data.ProcessedPart(text_part, result)


def find_starts(tokens: "list[str]", text: str) -> "list[int]":
    text_chars = enumerate(iter(text))
    starts = []
    for token in tokens:
        length = len(token)
        matched = 0
        candidate = -1
        while matched < length:
            i, current = next(text_chars)
            if current != token[matched]:
                matched = 0
                continue
            if matched == 0:
                candidate = i
            matched += 1
        starts.append(candidate)
    assert len(starts) == len(tokens)
    return starts


def cltk_pos_to_alatius(
    cltk_pos_bundle: "dict[str, list[str]]", cltk_pos_type: str
) -> str:
    cltk_pos = {}
    for category, values in cltk_pos_bundle.items():
        cltk_pos[str(category)] = [str(value) for value in values]
    result = ["u", "-", "-", "-", "-", "-", "-", "-", "-"]

    if cltk_pos_type in ["CCONJ", "SCONJ"]:
        result[0] = "c"
    if cltk_pos_type == "ADV":
        result[0] = "d"

    has_number = "Number" in cltk_pos
    has_gender = "Gender" in cltk_pos
    has_case = "Case" in cltk_pos

    if "Person" in cltk_pos:
        result[1] = _PERSON_DICT[cltk_pos["Person"][0]]
    if has_number:
        result[2] = _NUMBER_DICT[cltk_pos["Number"][0]]
    if "Tense" in cltk_pos:
        result[3] = _TENSE_DICT[cltk_pos["Tense"][0]]
    if "Mood" in cltk_pos:
        result[4] = _MOOD_DICT[cltk_pos["Mood"][0]]
    if "Voice" in cltk_pos:
        result[5] = _VOICE_DICT[cltk_pos["Voice"][0]]
    if has_gender:
        result[6] = _GENDER_DICT[cltk_pos["Gender"][0]]
    if "Case" in cltk_pos:
        result[7] = _CASE_DICT[cltk_pos["Case"][0]]
    if "Degree" in cltk_pos:
        result[8] = _DEGREE_DICT[cltk_pos["Degree"][0]]

    if "VerbForm" in cltk_pos:
        verb_form = cltk_pos["VerbForm"][0]
        if verb_form == "infinitive":
            result[4] = _MOOD_DICT[verb_form]
        if verb_form == "gerund":
            result[0] = "v"

    if result[3] == "past":
        verb_form = cltk_pos["VerbForm"][0]
        aspect = cltk_pos["Aspect"][0]
        if aspect == "perfective":
            result[3] = _TENSE_DICT["perfect"]
        else:
            result[3] = _TENSE_DICT["imperfect"]
        if verb_form == "participle":
            result[4] = _MOOD_DICT[verb_form]

    if has_number and has_gender and has_case:
        pro_type = cltk_pos.get("PrononimalType", [None])[0]
        if pro_type in ["relative", "demonstrative", "personal"]:
            result[0] = "p"
        elif len(cltk_pos) == 3:
            result[0] = "n"
        else:
            result[0] = "a"
    if "AdpositionalType" in cltk_pos:
        result[0] = "r"
    if "Numeral" in cltk_pos:
        result[0] = "m"
    if (result[3] != "-") or (result[4] != "-"):
        result[0] = "v"
    return "".join(result)


class CltkDefault(Pipeline):
    def initialize(self) -> None:
        import cltk  # pytype: disable=import-error

        self._nlp = cltk.NLP(language="lat")
        self._nlp.analyze("ego")

        # pytype: disable=import-error
        from src.libs.latin_macronizer.macronizer_modified import Macronizer

        # pytype: enable=import-error
        self._macronizer = Macronizer()

    def process_text(self, text_part: data.TextPart) -> data.ProcessedPart:
        doc = self._nlp.analyze(text_part.text)
        starts = find_starts(doc.tokens, text_part.text)
        tags = []
        for i, start in enumerate(starts):
            tags.append(
                data.PosTag(
                    token=doc.tokens[i],
                    tag=str(doc.morphosyntactic_features[i]),
                    index=start,
                )
            )
        alatius = self._macronizer.get_nitin(text_part.text)
        cltk_tokens = enumerate(iter(doc.tokens))
        prev_state = None
        for i, alatius_token in enumerate(alatius.tokens):
            if alatius_token.isspace:
                continue
            if alatius_token.text in [":", "“", "”", "‘", "’", "–"]:
                continue
            if alatius_token.isenclitic:
                continue

            if prev_state is None:
                alatius_text = alatius_token.text
                j, cltk_token = next(cltk_tokens)
            else:
                prev_text, j, cltk_token = prev_state
                alatius_text = prev_text + alatius_token.text
                prev_state = None
            if alatius_text in ["["] and cltk_token.startswith(alatius_text):
                prev_state = alatius_text, j, cltk_token
                continue
            alatius_text = alatius_text.replace("”", "")

            cltk_pos = doc.morphosyntactic_features[j]
            print(f"\nCLTK: `{cltk_token}`, `{doc.pos[j]}`")
            print(f"Alatius: `{alatius_text}`")
            print(f"CLTK: `{cltk_pos}`")
            print(f"Alatius: `{alatius_token.tag}`")

            if cltk_token.lower() in ["nec"] and alatius_text.lower() in ["ne"]:
                # Alatius analyzes nec as ne + que, for whatever reason.
                pass
            elif "'" in cltk_token:
                modified = cltk_token.replace("'", "")
                assert modified == alatius_text
            elif alatius_token.hasenclitic:
                length = len(alatius_text)
                assert alatius_text == cltk_token[:length]
                assert cltk_token[length:].lower() in ["ne", "que", "ve"]
            else:
                assert alatius_text == cltk_token

            cltk_new = cltk_pos_to_alatius(cltk_pos, doc.pos[j])

            # Defer to Alatius on Gender:
            alatius_start = alatius_token.tag[:6]
            alatius_end = alatius_token.tag[7:]
            cltk_start = cltk_new[:6]
            cltk_end = cltk_new[7:]
            if (alatius_start == cltk_start) and (alatius_end == cltk_end):
                cltk_new = alatius_token.tag

            if alatius_token.tag != cltk_new:
                # print(f'\nCLTK: `{cltk_token}`, `{doc.pos[j]}`')
                # print(f'Alatius: `{alatius_text}`')
                # print(f'CLTK: `{cltk_pos}`')
                # print(f'Alatius: `{alatius_token.tag}`')
                print(f"CLTKnew: `{cltk_new}`")
            alatius_token.tag = cltk_new

        alatius.getaccents(self._macronizer.wordlist)
        alatius.macronize(True, False, False, False)

        return data.ProcessedPart(
            text_part, pos_tags=tags, output=alatius.detokenize(False)
        )


_MACRONS = {
    "ā": "a",
    "ē": "e",
    "ī": "i",
    "ō": "o",
    "ū": "u",
    "ȳ": "y",
    "Ā": "A",
    "Ē": "E",
    "Ī": "I",
    "Ō": "O",
    "Ū": "U",
    "Ȳ": "Y",
}


def _remove_macrons(input: str) -> str:
    output = input
    for marked, unmarked in _MACRONS.items():
        output = output.replace(marked, unmarked)
    return output


def _tokenize(input: str) -> "list[str]":
    tokens = []
    token = ""
    for c in input:
        if c.isalnum():
            token += c
        elif token:
            tokens.append(token)
            token = ""
    if token:
        tokens.append(token)
    return tokens


class TestHarness:
    def __init__(self, golden_file: str, pipelines: "list[Pipeline]") -> None:
        self._golden_file = golden_file
        self._pipelines = pipelines
        for pipeline in self._pipelines:
            pipeline.initialize()

    def compare(self) -> None:
        golden = perseus_parser.parse_perseus_xml(self._golden_file)
        results = []
        for section in golden:
            section_result = {}
            golden_text = section.text
            section_result["Golden"] = golden_text
            unmacronized = _remove_macrons(golden_text)
            for pipeline in self._pipelines:
                marked = pipeline.process_text(data.TextPart(0, 0, 0, unmacronized))
                section_result[pipeline.__class__.__name__] = marked.output
            section_name = f"Section {section.book} {section.chapter} {section.section}"
            results.append((section_name, section_result))

        out_file = f"processed_texts/{self._golden_file}"
        os.makedirs(os.path.dirname(out_file), exist_ok=True)
        with open(out_file, "w+") as f:
            json.dump(results, f, cls=data.JSONEncoder, ensure_ascii=False, indent=2)

        for section_name, section_result in results:
            golden_tokens = _tokenize(section_result["Golden"])
            expected_num = len(golden_tokens)
            # print(f'Golden: {expected_num} tokens')
            versions = []
            for version, output in section_result.items():
                version_tokens = _tokenize(output)
                # print(f'{version}: {len(version_tokens)} tokens')
                assert len(version_tokens) == expected_num
                versions.append((version, version_tokens))

            section_name = "Results: " + section_name
            divider = "".join(["="] * len(section_name))
            print(f"\n{divider}\n{section_name}\n{divider}")

            print("\nErrors:\n")
            errors = {version: 0 for version, _ in versions}
            for i in range(len(golden_tokens)):
                expected = golden_tokens[i]
                actuals = [(version, actuals[i]) for version, actuals in versions]
                incorrects = []
                for version, actual in actuals:
                    if expected != actual:
                        errors[version] += 1
                        incorrects.append((version, actual))
                if incorrects:
                    messages = [
                        f"got `{actual}` from {version}"
                        for version, actual in incorrects
                    ]
                    err_message = "; and ".join(messages)
                    print(f"Expected {expected} but: {err_message}")

            print("\nSummary:\n")
            for version, num_errors in errors.items():
                accuracy = str(100 * (1 - (num_errors / expected_num)))[:4]
                print(
                    f"{version}: {num_errors} / {expected_num} incorrect, {accuracy}% accurate."
                )
