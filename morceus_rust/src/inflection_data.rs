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

/// The inflection data in a compact 4 bit representation.
///
/// The following assumptions are made:
/// - Case and Gender can be repeated.
/// - All other fields can only have one value.
///
/// The first two bytes are used to store all non-repeated fields, as follows.
/// - The 0 value encodes "not present".
/// - Otherwise, the value is set based on the enum value. For example,
///   for LatinTense, Perfect would be encoded as 4 (in binary).
///
/// The layout is as follows:
/// - Bits 0-1: Number - [2 bits] (2 possible values + not present)
/// - Bits 2-3: Person - [2 bits] (3 possible values + not present)
/// - Bits 4-5: Voice - [2 bits] (2 possible values + not present)
/// - Bits 6-7: Degree - [2 bits] (3 possible values + not present)
/// - Bits 8-10: Tense - [3 bits] (7 possible values + not present)
/// - Bits 11-13: Mood - [3 bits] (6 possible values + not present)
///
/// Repeated fields are stored as bitsets within a single byte. For example, if we had
/// something with both Dative and Genitive case, then (since LatinCase.Dative = 3 and
/// LatinCase.Genitive = 4), the case byte would be 00011000 (bits 3 and 4 set).
///
/// The 3rd byte is for case, and the 4th byte is for gender.
pub type WordInflectionData = u32;

const NUMBER_SHIFT: u32 = 0;
const PERSON_SHIFT: u32 = 2;
const VOICE_SHIFT: u32 = 4;
const DEGREE_SHIFT: u32 = 6;
const TENSE_SHIFT: u32 = 8;
const MOOD_SHIFT: u32 = 11;
const CASE_SHIFT: u32 = 16;
const GENDER_SHIFT: u32 = 24;

const TWO_BITS: u32 = 0b11;
const THREE_BITS: u32 = 0b111;
const BYTE_MASK: u32 = 0xff;

#[inline]
fn extract_field(data: WordInflectionData, shift: u32, mask: u32) -> u32 {
    (data >> shift) & mask
}

#[inline]
pub fn extract_number(data: WordInflectionData) -> u32 {
    extract_field(data, NUMBER_SHIFT, TWO_BITS)
}

#[inline]
pub fn extract_person(data: WordInflectionData) -> u32 {
    extract_field(data, PERSON_SHIFT, TWO_BITS)
}

#[inline]
pub fn extract_voice(data: WordInflectionData) -> u32 {
    extract_field(data, VOICE_SHIFT, TWO_BITS)
}

#[inline]
pub fn extract_degree(data: WordInflectionData) -> u32 {
    extract_field(data, DEGREE_SHIFT, TWO_BITS)
}

#[inline]
pub fn extract_tense(data: WordInflectionData) -> u32 {
    extract_field(data, TENSE_SHIFT, THREE_BITS)
}

#[inline]
pub fn extract_mood(data: WordInflectionData) -> u32 {
    extract_field(data, MOOD_SHIFT, THREE_BITS)
}

#[inline]
pub fn extract_case_bits(data: WordInflectionData) -> u32 {
    extract_field(data, CASE_SHIFT, BYTE_MASK)
}

#[inline]
pub fn extract_gender_bits(data: WordInflectionData) -> u32 {
    extract_field(data, GENDER_SHIFT, BYTE_MASK)
}

#[inline]
fn merge_single_field(
    template: WordInflectionData,
    modifier: WordInflectionData,
    shift: u32,
    mask: u32,
) -> Option<u32> {
    let template_val = extract_field(template, shift, mask);
    let modifier_val = extract_field(modifier, shift, mask);
    if template_val == 0 {
        return Some(modifier_val);
    }
    if modifier_val == 0 {
        return Some(template_val);
    }
    (template_val == modifier_val).then_some(template_val)
}

#[inline]
fn merge_bitset_field(
    template: WordInflectionData,
    modifier: WordInflectionData,
    shift: u32,
) -> Option<u32> {
    let template_bits = extract_field(template, shift, BYTE_MASK);
    let modifier_bits = extract_field(modifier, shift, BYTE_MASK);
    if template_bits == 0 {
        return Some(modifier_bits);
    }
    if modifier_bits == 0 {
        return Some(template_bits);
    }
    let intersection = template_bits & modifier_bits;
    (intersection != 0).then_some(intersection)
}

/// Merges inflection data when computing templated tables.
pub fn merge_inflection_data(
    template: WordInflectionData,
    modifier: WordInflectionData,
) -> Option<WordInflectionData> {
    let number = merge_single_field(template, modifier, NUMBER_SHIFT, TWO_BITS)?;
    let person = merge_single_field(template, modifier, PERSON_SHIFT, TWO_BITS)?;
    let voice = merge_single_field(template, modifier, VOICE_SHIFT, TWO_BITS)?;
    let degree = merge_single_field(template, modifier, DEGREE_SHIFT, TWO_BITS)?;
    let tense = merge_single_field(template, modifier, TENSE_SHIFT, THREE_BITS)?;
    let mood = merge_single_field(template, modifier, MOOD_SHIFT, THREE_BITS)?;
    let case_bits = merge_bitset_field(template, modifier, CASE_SHIFT)?;
    let gender_bits = merge_bitset_field(template, modifier, GENDER_SHIFT)?;

    let mut merged: WordInflectionData = 0;
    merged |= number << NUMBER_SHIFT;
    merged |= person << PERSON_SHIFT;
    merged |= voice << VOICE_SHIFT;
    merged |= degree << DEGREE_SHIFT;
    merged |= tense << TENSE_SHIFT;
    merged |= mood << MOOD_SHIFT;
    merged |= case_bits << CASE_SHIFT;
    merged |= gender_bits << GENDER_SHIFT;

    Some(merged)
}
