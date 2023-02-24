import abc
import os
import re
import time
from typing import Any, Optional

import json

from src.py.nlp import tokenization
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
        start = time.time()
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
        print(f"Total runtime: {time.time() - start} seconds")


class Alatius(Pipeline):
    def initialize(self) -> None:
        # pytype: disable=import-error
        from src.libs.latin_macronizer.macronizer_modified import Macronizer

        # pytype: enable=import-error
        self._macronizer = Macronizer()

    def process_text(self, text_part: data.TextPart) -> data.ProcessedPart:
        result = self._macronizer.macronize(text_part.text)
        return data.ProcessedPart(text_part, result)


class AlatiusCustomTokenization(Pipeline):
    def initialize(self) -> None:
        # pytype: disable=import-error
        from src.libs.latin_macronizer.macronizer_modified import Macronizer

        # pytype: enable=import-error
        self._macronizer = Macronizer()

    def process_text(self, text_part: data.TextPart) -> data.ProcessedPart:
        tokens = tokenization.tokenize(text_part.text)
        self._macronizer.tokenization = tokenization.to_alatius(tokens)
        self._macronizer.wordlist.loadwords(
            self._macronizer.tokenization.allwordforms()
        )
        newwordforms = self._macronizer.tokenization.splittokens(
            self._macronizer.wordlist
        )
        self._macronizer.wordlist.loadwords(newwordforms)
        self._macronizer.tokenization.addtags()
        self._macronizer.tokenization.addlemmas(self._macronizer.wordlist)
        self._macronizer.tokenization.getaccents(self._macronizer.wordlist)
        self._macronizer.tokenization.macronize(True, False, False, False)
        result = self._macronizer.tokenization.detokenize(False)
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
    if cltk_pos_type in ["ADV", "PART"]:
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
        if verb_form in ["infinitive", "participle"]:
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


class Timer:
    def __init__(self):
        self.times: list[float] = [time.time()]
        self.tags: list[str] = []

    def record(self, tag: str):
        self.times.append(time.time())
        self.tags.append(tag)

    def print(self):
        elapsed_times: list[float] = []
        for i in range(len(self.times) - 1):
            elapsed_times.append(self.times[i + 1] - self.times[i])
        self.tags.append("Total")
        elapsed_times.append(self.times[-1] - self.times[0])

        time_strings = [str(round(elapsed * 1000, 2)) for elapsed in elapsed_times]
        max_tag_len = max([len(tag) for tag in self.tags])
        max_time_len = max([len(elapsed) for elapsed in time_strings])
        for tag, elapsed in zip(self.tags, time_strings):
            tag_pad = " " * (max_tag_len - len(tag))
            time_pad = " " * (max_time_len - len(elapsed))
            print(f"{tag}{tag_pad} : {time_pad}{elapsed} ms")


class StanzaCustomTokenization(Pipeline):
    # pytype: disable=name-error
    _nlp: "stanza.Pipeline"
    _macronizer: "src.libs.latin_macronizer.macronizer_modified.Macronizer"
    # pytype: enable=name-error

    def initialize(self) -> None:
        # pytype: disable=import-error
        import stanza
        from src.libs.latin_macronizer.macronizer_modified import Macronizer

        # pytype: enable=import-error

        self._nlp = stanza.Pipeline(
            "la", tokenize_pretokenized=True, processors="tokenize,pos"
        )
        self._run_stanza_pos(self._tokenize("ego"))
        self._macronizer = Macronizer()

    def _tokenize(self, text: str) -> "list[tokenization.Token]":
        # pytype: disable=import-error
        from cltk.alphabet.text_normalization import cltk_normalize
        from cltk.alphabet.text_normalization import remove_odd_punct

        # pytype: enable=import-error
        sanitized = remove_odd_punct(cltk_normalize(text))
        return tokenization.tokenize(sanitized)

    def _run_stanza_pos(self, tokens: "list[tokenization.Token]"):
        # pytype: disable=import-error
        from cltk.core.data_types import Doc
        from cltk.dependency.processes import StanzaProcess

        # pytype: enable=import-error
        sentences = tokenization.to_stanza(tokens)
        doc = Doc()
        stanza_doc = self._nlp.process(sentences)
        doc.words = StanzaProcess.stanza_to_cltk_word_type(stanza_doc)
        return doc

    def _run_alatius_pos(self, tokens: "list[tokenization.Token]"):
        self._macronizer.tokenization = tokenization.to_alatius(tokens)
        self._macronizer.wordlist.loadwords(
            self._macronizer.tokenization.allwordforms()
        )
        newwordforms = self._macronizer.tokenization.splittokens(
            self._macronizer.wordlist
        )
        self._macronizer.wordlist.loadwords(newwordforms)
        # Real Alatius adds tags here, but we don't need it.
        # TODO: Add evaluation mode where we compare with Alatius tags.
        self._macronizer.tokenization.addlemmas(self._macronizer.wordlist)

    def process_text(self, text_part: data.TextPart) -> data.ProcessedPart:
        print(f"Characters: {len(text_part.text)}")
        tokens = self._tokenize(text_part.text)
        stanza_doc = self._run_stanza_pos(tokens)
        self._run_alatius_pos(tokens)

        alatius = self._macronizer.tokenization
        cltk_tokens = enumerate(iter(stanza_doc.tokens))
        for alatius_token in alatius.tokens:
            if alatius_token.isspace:
                continue
            if alatius_token.isenclitic:
                continue

            alatius_text = alatius_token.text
            j, cltk_token = next(cltk_tokens)
            cltk_pos = stanza_doc.morphosyntactic_features[j]
            cltk_new = cltk_pos_to_alatius(cltk_pos, stanza_doc.pos[j])

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
            alatius_token.tag = cltk_new

        alatius.getaccents(self._macronizer.wordlist)
        alatius.macronize(True, False, False, False)

        return data.ProcessedPart(text_part, output=alatius.detokenize(False))


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

        error_totals = {pipeline.__class__.__name__: 0 for pipeline in self._pipelines}
        total_words = 0
        for section_name, section_result in results:
            golden_tokens = _tokenize(section_result["Golden"])
            expected_num = len(golden_tokens)
            total_words += expected_num
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
                if version == "Golden":
                    continue
                error_totals[version] += num_errors
                accuracy = str(100 * (1 - (num_errors / expected_num)))[:4]
                print(
                    f"{version}: {num_errors} / {expected_num} incorrect, {accuracy}% accurate."
                )
        print("\n=======\nTotals:\n=======")
        ref_version, ref_errors = None, None
        for version, num_errors in error_totals.items():
            accuracy = str(100 * (1 - (num_errors / total_words)))[:4]
            print(
                f"{version}: {num_errors} / {total_words} incorrect, {accuracy}% accurate."
            )
            if ref_version is None:
                ref_version = version
                ref_errors = num_errors
            else:
                delta = 100 * (num_errors - ref_errors) / ref_errors
                comparator = "FEWER" if delta < 0 else "MORE"
                delta = str(abs(delta))[:4]
                print(f"{version} has {delta}% {comparator} errors than {ref_version}")
