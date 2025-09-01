#![cfg_attr(
    not(test),
    deny(clippy::unwrap_used, clippy::expect_used, clippy::panic)
)]

pub mod analyzer_types;
pub mod bitmask_utils;
pub mod common;
pub mod corpus_query_engine;
pub mod corpus_serialization;
pub mod index_data_utils;
pub mod packed_arrays;
pub mod packed_index_utils;
pub mod profiler;
pub mod query_parsing_v2;
