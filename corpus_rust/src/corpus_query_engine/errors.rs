use crate::corpus_query_engine::QueryExecError;

impl QueryExecError {
    pub(super) fn new(message: &str) -> Self {
        QueryExecError {
            message: message.to_string(),
        }
    }
}

impl From<String> for QueryExecError {
    fn from(e: String) -> Self {
        QueryExecError::new(&e)
    }
}
