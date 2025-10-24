use crate::build_corpus_v2::library_utils::{
    CorpusInputWork, LIB_CORPUS_INPUT_DIR, LIB_INDEX_PATH, find_files_from_library_index,
};

mod library_utils;

pub fn build_corpus() -> Result<(), Box<dyn std::error::Error>> {
    let corpus_files = find_files_from_library_index(LIB_INDEX_PATH, LIB_CORPUS_INPUT_DIR)?;
    println!("Found {} files in library index.", corpus_files.len());
    for file_path in corpus_files {
        println!("Processing file: {}", file_path);
        let work = CorpusInputWork::from_file(&file_path)?;
        println!(
            "Loaded work: {} by {} ({} rows)",
            work.work_name,
            work.author,
            work.rows.len()
        );
    }
    Ok(())
}
