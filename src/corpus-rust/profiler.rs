use std::time::Instant;

#[derive(Debug)]
pub struct TimeProfiler {
    last_phase_time: Instant,
    stats: Vec<(String, u128)>,
}

impl TimeProfiler {
    pub fn new() -> Self {
        TimeProfiler {
            last_phase_time: Instant::now(),
            stats: Vec::new(),
        }
    }

    pub fn phase(&mut self, name: &str) {
        let now = Instant::now();
        let duration = now.duration_since(self.last_phase_time);
        self.stats
            .push((name.to_string(), duration.as_micros()));
        self.last_phase_time = now;
    }

    pub fn get_stats(&self) -> &Vec<(String, u128)> {
        &self.stats
    }
}
