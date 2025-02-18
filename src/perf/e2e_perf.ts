const E2E_METRICS_ROOT = "e2e_metrics";
export const E2E_REPORTS_DIR = `${E2E_METRICS_ROOT}/reports`;
export const E2E_RAW_METRICS_DIR = `${E2E_METRICS_ROOT}/raw`;

export interface PerformanceTestResult {
  testId: {
    name: string;
    screenSize: "small" | "large";
  };
  metrics: Record<string, number[]>;
}
