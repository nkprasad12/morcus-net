use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::inflection_data::WordInflectionData;

#[derive(Debug, Clone, Deserialize)]
#[serde(from = "(u32, String, bool, bool)")]
pub struct StemMapValue {
    pub index: u32,
    pub lemma: String,
    pub is_verb: bool,
    pub is_stem: bool,
}

// Implementation to convert from tuple format (as in JSON) to a struct.
impl From<(u32, String, bool, bool)> for StemMapValue {
    fn from(tuple: (u32, String, bool, bool)) -> Self {
        StemMapValue {
            index: tuple.0,
            lemma: tuple.1,
            is_verb: tuple.2,
            is_stem: tuple.3,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum StemOrForm {
    Stem(Stem),
    IrregularForm(IrregularForm),
}

/// Context for a single inflection ending, like case, tense, etc...
/// along with tags to contextualize that ending.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InflectionContext {
    pub grammatical_data: WordInflectionData,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub internal_tags: Option<Vec<String>>,
}

// :wd: 	indeclinable form (preposition, adverb, interjection, etc.) or unanalyzed irregular form
// :aj: 	adjective; must have an inflectional class
// :no: 	noun; must have an inflectional class and a gender
// :vb: 	verb form; for unanalyzed irregular forms
// :de: 	derivable verb; must have an inflectional class
// :vs: 	verb stem, one of the principal parts; must have an inflectional class
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(from = "Option<String>")]
#[serde(rename_all = "lowercase")]
pub enum StemCode {
    None = 0,
    Wd = 1,
    Aj = 2,
    No = 3,
    Vb = 4,
    De = 5,
    Vs = 6,
}

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

impl StemCode {
    pub fn is_indeclinable(&self) -> bool {
        matches!(self, StemCode::Wd | StemCode::Vb)
    }

    pub fn is_none(&self) -> bool {
        matches!(self, StemCode::None)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
/// Represents a stem, the common prefix that can be attached to an ending from an
/// inflection table to form a word.
pub struct Stem {
    #[serde(skip_serializing_if = "StemCode::is_none")]
    pub code: StemCode,
    pub stem: String,
    pub inflection: InflectionTableKey,
    #[serde(flatten)]
    pub context: InflectionContext,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
/// Represents an irregular form that does not follow standard inflection patterns.
/// Unlike a `Stem`, an `IrregularForm` represents a complete word and doesn't
/// need to be combined with an ending.
pub struct IrregularForm {
    #[serde(skip_serializing_if = "StemCode::is_none")]
    pub code: StemCode,
    pub form: String,
    #[serde(flatten)]
    pub context: InflectionContext,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InflectionEnding {
    pub ending: String,
    #[serde(flatten)]
    pub context: InflectionContext,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Lemma {
    pub lemma: String,
    pub stems: Option<Vec<u32>>,
    pub irregular_forms: Option<Vec<u32>>,
    // The default is false if not present.
    #[serde(default)]
    pub is_verb: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InflectionTable {
    pub name: String,
    pub endings: Vec<InflectionEnding>,
}

/// Maps ending strings (with vowel lengths) to the full ending information.
/// For example, in the table for "a_ae", the key for "ae" would map to the
/// endings for dative and genitive singular, as well as the accusative singular.
pub type SortedInflectionTable = HashMap<String, Vec<InflectionEnding>>;
pub type InflectionTableKey = u16;

// Data structures required for computing inflection analyses.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CruncherTables {
    /// Maps endings to the possible inflection paradigms associated with that ending.
    /// For example, if "a_ae" is the 3rd inflection in the `inflectionLookup` table,
    /// then "am" -> [2] would be an entry in this map.
    #[cfg(feature = "crunch")]
    pub ends_map: HashMap<String, Vec<InflectionTableKey>>,
    #[cfg(feature = "crunch")]
    pub stem_map: HashMap<String, Vec<StemMapValue>>,
    /// All inflection tables. Other structures reference these by index using
    /// `InflectionTableKey` (a `u16` to save memory).
    pub inflection_lookup: Vec<SortedInflectionTable>,
    #[cfg(feature = "extra")]
    pub numerals: Vec<Lemma>,
    #[cfg(feature = "extra")]
    pub raw_tables: HashMap<String, InflectionTable>,
    #[cfg(feature = "extra")]
    pub raw_lemmata: HashMap<String, Vec<Lemma>>,
    pub all_stems: Vec<Stem>,
    pub all_irregs: Vec<IrregularForm>,
}

fn is_false(value: &bool) -> bool {
    !*value
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrunchResult {
    pub lemma: String,
    pub form: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stem: Option<Stem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end: Option<InflectionEnding>,
    #[serde(skip_serializing_if = "is_false")]
    pub relaxed_case: bool,
    #[serde(skip_serializing_if = "is_false")]
    pub relaxed_vowel_lengths: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enclitic: Option<String>,
    pub is_verb: bool,
    #[serde(flatten)]
    pub context: InflectionContext,
}

pub enum VowelLength {
    Strict,
    Relaxed,
}

pub struct CruncherOptions {
    pub vowel_length: VowelLength,
    pub relax_case: bool,
    pub relax_u_and_v: bool,
    pub relax_i_and_j: bool,
    pub handle_enclitics: bool,
    pub skip_consolidation: bool,
}

impl Default for CruncherOptions {
    fn default() -> Self {
        CruncherOptions {
            vowel_length: VowelLength::Relaxed,
            relax_case: true,
            relax_u_and_v: true,
            relax_i_and_j: true,
            handle_enclitics: true,
            skip_consolidation: true,
        }
    }
}
