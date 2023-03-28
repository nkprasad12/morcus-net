import time

from src.py.nlp import tokenization
from src.py.utils import processing


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


class Alatius(processing.Process[str, str]):
    def initialize(self) -> None:
        super().initialize()
        # pytype: disable=import-error
        from src.libs.latin_macronizer.macronizer_modified import Macronizer

        # pytype: enable=import-error
        self._macronizer = Macronizer()

    def process(self, input: str) -> str:
        return self._macronizer.macronize(input)


class AlatiusManualWeb(processing.Process[str, str]):  # pragma: no cover
    def process(self, inputStr: str) -> str:
        print("Enter text into Alatius")
        print(inputStr)
        inputs = []
        while True:
            read = input()
            if read == "DONE!":
                break
            inputs.append(read)
        return "\n".join(inputs)


class AlatiusCustomTokenization(processing.Process[str, str]):
    def initialize(self) -> None:
        super().initialize()
        # pytype: disable=import-error
        from src.libs.latin_macronizer.macronizer_modified import Macronizer

        # pytype: enable=import-error
        self._macronizer = Macronizer()

    def process(self, input: str) -> str:
        tokens = tokenization.tokenize(input)
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
        return self._macronizer.tokenization.detokenize(False)


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


# Overall results are actually worse than Alatius, but preserving
# for documentation reasons.
class Lamon(processing.Process[str, str]):  # pragma: no cover
    # pytype: disable=name-error
    _lamon: "lamonpy.Lamon"
    _macronizer: "src.libs.latin_macronizer.macronizer_modified.Macronizer"
    # pytype: enable=name-error

    def initialize(self) -> None:
        super().initialize()
        # pytype: disable=import-error
        import lamonpy
        from src.libs.latin_macronizer.macronizer_modified import Macronizer

        # pytype: enable=import-error

        self._lamon = lamonpy.Lamon()
        self._lamon.tag("ego")
        self._macronizer = Macronizer()

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
        self._macronizer.tokenization.addlemmas(self._macronizer.wordlist)

    def process(self, input: str) -> str:
        # pytype: disable=import-error
        from cltk.alphabet.text_normalization import cltk_normalize
        from cltk.alphabet.text_normalization import remove_odd_punct

        # pytype: enable=import-error
        sanitized = remove_odd_punct(cltk_normalize(input))
        lamon_result = self._lamon.tag(sanitized)[0][1]

        tokens = tokenization.from_lamon(sanitized, lamon_result)
        self._run_alatius_pos(tokens)

        alatius = self._macronizer.tokenization
        all_lamon_tokens = [
            x.text for x in tokens if x.kind != tokenization.TokenType.OTHER
        ]
        # assert len(all_lamon_tokens) == len(lamon_result)
        lamon_tokens = enumerate(iter(all_lamon_tokens))

        for alatius_token in alatius.tokens:
            if alatius_token.isspace:
                continue
            if alatius_token.isenclitic:
                continue

            alatius_text = alatius_token.text
            j, lamon_token = next(lamon_tokens)
            lamon_tag = lamon_result[j][3]

            if lamon_token.lower() in ["nec"] and alatius_text.lower() in ["ne"]:
                # Alatius analyzes nec as ne + que, for whatever reason.
                pass
            elif alatius_token.hasenclitic:
                length = len(alatius_text)
                assert alatius_text == lamon_token[:length]
                assert lamon_token[length:].lower() in ["ne", "que", "ve"]
            else:
                assert alatius_text == lamon_token
            alatius_token.tag = lamon_tag

        alatius.getaccents(self._macronizer.wordlist)
        alatius.macronize(True, False, False, False)
        return alatius.detokenize(False)


class StanzaCustomTokenization(processing.Process[str, str]):
    # pytype: disable=name-error
    _nlp: "stanza.Pipeline"
    _macronizer: "src.libs.latin_macronizer.macronizer_modified.Macronizer"
    # pytype: enable=name-error

    def __init__(self, use_gpu: bool = True, comparison_mode=False) -> None:
        super().__init__()
        self._use_gpu = use_gpu
        self._comparison_mode = comparison_mode

    def initialize(self) -> None:
        super().initialize()
        # pytype: disable=import-error
        import stanza
        from src.libs.latin_macronizer.macronizer_modified import Macronizer

        # pytype: enable=import-error

        self._nlp = stanza.Pipeline(
            "la",
            tokenize_pretokenized=True,
            processors="tokenize,pos",
            download_method=None,
            use_gpu=self._use_gpu,
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
        if self._comparison_mode:
            self._macronizer.tokenization.addtags()
        self._macronizer.tokenization.addlemmas(self._macronizer.wordlist)

    def process(self, input: str) -> str:
        tokens = self._tokenize(input)
        stanza_doc = self._run_stanza_pos(tokens)
        self._run_alatius_pos(tokens)

        alatius = self._macronizer.tokenization
        cltk_tokens = enumerate(iter(stanza_doc.tokens))
        cltk_features_list = stanza_doc.morphosyntactic_features
        stanza_pos = stanza_doc.pos
        for alatius_token in alatius.tokens:
            if alatius_token.isspace:
                continue
            if alatius_token.isenclitic:
                continue

            alatius_text = alatius_token.text
            j, cltk_token = next(cltk_tokens)
            cltk_features = cltk_features_list[j]
            cltk_new = cltk_pos_to_alatius(cltk_features, stanza_pos[j])

            if cltk_token.lower() in ["nec"] and alatius_text.lower() in ["ne"]:
                # Alatius analyzes nec as ne + que, for whatever reason.
                pass
            elif alatius_token.hasenclitic:
                length = len(alatius_text)
                assert alatius_text == cltk_token[:length]
                assert cltk_token[length:].lower() in ["ne", "que", "ve"]
            else:
                assert alatius_text == cltk_token
            if alatius_token.text != "." and alatius_token.possible_lemmata > 1:
                if self._comparison_mode:
                    print(f"=====\nNITIN: {alatius_token.text}")
                    print(f"Corpus Lemmata: {alatius_token.corpus_lemmata}")
                    print(f"Lex Lemmata: {alatius_token.lex_lemmata}")
                    print(f"Stanza Tag: {cltk_new}")
                    print(f"Alatiu Tag: {alatius_token.tag}")
            alatius_token.tag = cltk_new

        alatius.getaccents(self._macronizer.wordlist)
        alatius.macronize(True, False, False, False)
        return alatius.detokenize(False)
