use std::str::FromStr;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LatinCase {
    Nominative = 1,
    Accusative = 2,
    Dative = 3,
    Genitive = 4,
    Ablative = 5,
    Vocative = 6,
    Locative = 7,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LatinNumber {
    Singular = 1,
    Plural = 2,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LatinGender {
    Masculine = 1,
    Feminine = 2,
    Neuter = 3,
    Adverbial = 4,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LatinPerson {
    First = 1,
    Second = 2,
    Third = 3,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LatinMood {
    Indicative = 1,
    Imperative = 2,
    Subjunctive = 3,
    Participle = 4,
    Gerundive = 5,
    Infinitive = 6,
    Supine = 7,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LatinVoice {
    Active = 1,
    Passive = 2,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LatinTense {
    Present = 1,
    Imperfect = 2,
    Perfect = 3,
    FuturePerfect = 4,
    Future = 5,
    Pluperfect = 6,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LatinDegree {
    Positive = 1,
    Comparative = 2,
    Superlative = 3,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LatinInflection {
    Case(LatinCase),
    Number(LatinNumber),
    Gender(LatinGender),
    Person(LatinPerson),
    Mood(LatinMood),
    Voice(LatinVoice),
    Tense(LatinTense),
    Degree(LatinDegree),
}

impl LatinInflection {
    pub fn get_label(&self) -> &str {
        match self {
            LatinInflection::Case(_) => "case",
            LatinInflection::Number(_) => "number",
            LatinInflection::Gender(_) => "gender",
            LatinInflection::Person(_) => "person",
            LatinInflection::Mood(_) => "mood",
            LatinInflection::Voice(_) => "voice",
            LatinInflection::Tense(_) => "tense",
            LatinInflection::Degree(_) => "degree",
        }
    }

    pub fn to_code(&self) -> String {
        let num = match self {
            LatinInflection::Case(c) => *c as u8,
            LatinInflection::Number(n) => *n as u8,
            LatinInflection::Gender(g) => *g as u8,
            LatinInflection::Person(p) => *p as u8,
            LatinInflection::Mood(m) => *m as u8,
            LatinInflection::Voice(v) => *v as u8,
            LatinInflection::Tense(t) => *t as u8,
            LatinInflection::Degree(d) => *d as u8,
        };
        num.to_string()
    }
}

impl FromStr for LatinCase {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_lowercase().as_str() {
            "nominative" | "nom" | "n" | "1" => Ok(LatinCase::Nominative),
            "accusative" | "acc" | "ac" | "2" => Ok(LatinCase::Accusative),
            "dative" | "dat" | "d" | "3" => Ok(LatinCase::Dative),
            "genitive" | "gen" | "g" | "4" => Ok(LatinCase::Genitive),
            "ablative" | "abl" | "ab" | "5" => Ok(LatinCase::Ablative),
            "vocative" | "voc" | "v" | "6" => Ok(LatinCase::Vocative),
            "locative" | "loc" | "l" | "7" => Ok(LatinCase::Locative),
            other => Err(format!("Unknown LatinCase: {}", other)),
        }
    }
}

impl FromStr for LatinNumber {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_lowercase().as_str() {
            "singular" | "sg" | "s" | "1" => Ok(LatinNumber::Singular),
            "plural" | "pl" | "p" | "2" => Ok(LatinNumber::Plural),
            other => Err(format!("Unknown LatinNumber: {}", other)),
        }
    }
}

impl FromStr for LatinGender {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_lowercase().as_str() {
            "masculine" | "m" | "mas" | "masc" | "1" => Ok(LatinGender::Masculine),
            "feminine" | "f" | "fem" | "2" => Ok(LatinGender::Feminine),
            "neuter" | "n" | "neu" | "neut" | "3" => Ok(LatinGender::Neuter),
            "adverbial" | "adv" | "a" | "4" => Ok(LatinGender::Adverbial),
            other => Err(format!("Unknown LatinGender: {}", other)),
        }
    }
}

impl FromStr for LatinPerson {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_lowercase().as_str() {
            "first" | "1st" | "1" | "i" => Ok(LatinPerson::First),
            "second" | "2nd" | "2" | "ii" => Ok(LatinPerson::Second),
            "third" | "3rd" | "3" | "iii" => Ok(LatinPerson::Third),
            other => Err(format!("Unknown LatinPerson: {}", other)),
        }
    }
}

impl FromStr for LatinMood {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_lowercase().as_str() {
            "indicative" | "ind" | "1" => Ok(LatinMood::Indicative),
            "imperative" | "imp" | "2" => Ok(LatinMood::Imperative),
            "subjunctive" | "subj" | "sub" | "3" => Ok(LatinMood::Subjunctive),
            "participle" | "part" | "4" => Ok(LatinMood::Participle),
            "gerundive" | "ger" | "5" => Ok(LatinMood::Gerundive),
            "infinitive" | "inf" | "6" => Ok(LatinMood::Infinitive),
            "supine" | "sup" | "7" => Ok(LatinMood::Supine),
            other => Err(format!("Unknown LatinMood: {}", other)),
        }
    }
}

impl FromStr for LatinVoice {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_lowercase().as_str() {
            "active" | "act" | "a" | "1" => Ok(LatinVoice::Active),
            "passive" | "pass" | "p" | "2" => Ok(LatinVoice::Passive),
            other => Err(format!("Unknown LatinVoice: {}", other)),
        }
    }
}

impl FromStr for LatinTense {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_lowercase().as_str() {
            "present" | "pres" | "pr" | "1" => Ok(LatinTense::Present),
            "imperfect" | "impf" | "i" | "2" => Ok(LatinTense::Imperfect),
            "perfect" | "perf" | "pf" | "3" => Ok(LatinTense::Perfect),
            "futureperfect" | "future_perfect" | "future-perfect" | "ftpf" | "fp" | "4" => {
                Ok(LatinTense::FuturePerfect)
            }
            "future" | "fut" | "f" | "5" => Ok(LatinTense::Future),
            "pluperfect" | "plup" | "pp" | "6" => Ok(LatinTense::Pluperfect),
            other => Err(format!("Unknown LatinTense: {}", other)),
        }
    }
}

impl FromStr for LatinDegree {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_lowercase().as_str() {
            "positive" | "pos" | "1" => Ok(LatinDegree::Positive),
            "comparative" | "comp" | "2" => Ok(LatinDegree::Comparative),
            "superlative" | "sup" | "3" => Ok(LatinDegree::Superlative),
            other => Err(format!("Unknown LatinDegree: {}", other)),
        }
    }
}

impl FromStr for LatinInflection {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let s = s.trim();
        // Try labeled form: "label:value" or "label=value"
        let label_idx = s.find([':', '=']);
        if label_idx.is_none() {
            return Err("Unlabeled inflection parsing not supported".to_string());
        }
        let (label, val) = s.split_at(label_idx.unwrap());
        let value = val[1..].trim();
        match label.trim().to_lowercase().as_str() {
            "case" => Ok(LatinInflection::Case(value.parse()?)),
            "number" => Ok(LatinInflection::Number(value.parse()?)),
            "gender" => Ok(LatinInflection::Gender(value.parse()?)),
            "person" => Ok(LatinInflection::Person(value.parse()?)),
            "mood" => Ok(LatinInflection::Mood(value.parse()?)),
            "voice" => Ok(LatinInflection::Voice(value.parse()?)),
            "tense" => Ok(LatinInflection::Tense(value.parse()?)),
            "degree" => Ok(LatinInflection::Degree(value.parse()?)),
            other => Err(format!("Unknown inflection label: {}", other)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_latin_inflection_examples() {
        assert_eq!(
            "case:nominative".parse::<LatinInflection>().unwrap(),
            LatinInflection::Case(LatinCase::Nominative)
        );
        assert_eq!(
            "case=acc".parse::<LatinInflection>().unwrap(),
            LatinInflection::Case(LatinCase::Accusative)
        );
        assert_eq!(
            "number:plural".parse::<LatinInflection>().unwrap(),
            LatinInflection::Number(LatinNumber::Plural)
        );
        assert_eq!(
            "gender:masc".parse::<LatinInflection>().unwrap(),
            LatinInflection::Gender(LatinGender::Masculine)
        );
        assert_eq!(
            "person:2".parse::<LatinInflection>().unwrap(),
            LatinInflection::Person(LatinPerson::Second)
        );
        assert_eq!(
            "mood:subjunctive".parse::<LatinInflection>().unwrap(),
            LatinInflection::Mood(LatinMood::Subjunctive)
        );
        assert_eq!(
            "voice:passive".parse::<LatinInflection>().unwrap(),
            LatinInflection::Voice(LatinVoice::Passive)
        );
        assert_eq!(
            "tense:pluperfect".parse::<LatinInflection>().unwrap(),
            LatinInflection::Tense(LatinTense::Pluperfect)
        );
        assert_eq!(
            "degree:superlative".parse::<LatinInflection>().unwrap(),
            LatinInflection::Degree(LatinDegree::Superlative)
        );
    }
}
