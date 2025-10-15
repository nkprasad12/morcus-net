use serde::Deserialize;
use std::collections::HashMap;

// StemMapValue: serialized as a tuple/array [Stem | IrregularForm, lemma: string, isVerb: boolean]
#[derive(Debug, Clone, Deserialize)]
#[serde(from = "(StemOrForm, String, bool)")]
pub struct StemMapValue {
    pub stem_or_form: StemOrForm,
    pub lemma: String,
    pub is_verb: bool,
}

// Implementation to convert from tuple format to struct
impl From<(StemOrForm, String, bool)> for StemMapValue {
    fn from(tuple: (StemOrForm, String, bool)) -> Self {
        StemMapValue {
            stem_or_form: tuple.0,
            lemma: tuple.1,
            is_verb: tuple.2,
        }
    }
}

// Updated StemOrForm to match TypeScript serialization
#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum StemOrForm {
    Stem(Stem),
    IrregularForm(IrregularForm),
}

// Inflection context
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InflectionContext {
    pub grammatical_data: u32,
    pub tags: Option<Vec<String>>,
    pub internal_tags: Option<Vec<String>>,
}

// :wd: 	indeclinable form (preposition, adverb, interjection, etc.) or unanalyzed irregular form
// :aj: 	adjective; must have an inflectional class
// :no: 	noun; must have an inflectional class and a gender
// :vb: 	verb form; for unanalyzed irregular forms
// :de: 	derivable verb; must have an inflectional class
// :vs: 	verb stem, one of the principal parts; must have an inflectional class
#[derive(Debug, Clone, Deserialize)]
#[serde(from = "Option<String>")]
pub enum StemCode {
    None = 0,
    Wd = 1,
    Aj = 2,
    No = 3,
    Vb = 4,
    De = 5,
    Vs = 6,
}

// Implementation to convert from tuple format to struct
impl From<Option<String>> for StemCode {
    fn from(code: Option<String>) -> Self {
        match code.as_deref() {
            Some("wd") => StemCode::Wd,
            Some("aj") => StemCode::Aj,
            Some("no") => StemCode::No,
            Some("vb") => StemCode::Vb,
            Some("de") => StemCode::De,
            Some("vs") => StemCode::Vs,
            None => StemCode::None,
            _ => panic!("Unknown StemCode"),
        }
    }
}

// Updated Stem: matches TS Stem which extends InflectionContext and has code, stem, inflection
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stem {
    pub code: StemCode,
    pub stem: String,
    pub inflection: String,
    #[serde(flatten)]
    pub context: InflectionContext,
}

// Updated IrregularForm: matches TS IrregularForm (extends InflectionContext, has optional code and form)
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IrregularForm {
    pub code: StemCode,
    pub form: String,
    #[serde(flatten)]
    pub context: InflectionContext,
}

// InflectionEnding matches TypeScript version
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InflectionEnding {
    pub ending: String,
    #[serde(flatten)]
    pub context: InflectionContext,
}

// Lemma definition
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Lemma {
    pub lemma: String,
    pub stems: Option<Vec<Stem>>,
    pub irregular_forms: Option<Vec<IrregularForm>>,
    pub is_verb: Option<bool>,
}

// InflectionTable structure
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InflectionTable {
    pub name: String,
    pub endings: Vec<InflectionEnding>,
}

// Type alias for the complex inflection lookup type
pub type InflectionLookupType = HashMap<String, HashMap<String, Vec<InflectionEnding>>>;

// Updated CruncherTables structure to match TypeScript serialization with Maps as plain objects
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CruncherTables {
    pub ends_map: HashMap<String, Vec<String>>,
    pub stem_map: HashMap<String, Vec<StemMapValue>>,
    pub inflection_lookup: InflectionLookupType,
    pub numerals: Vec<Lemma>,
    pub raw_tables: HashMap<String, InflectionTable>,
    pub raw_lemmata: HashMap<String, Vec<Lemma>>,
}
