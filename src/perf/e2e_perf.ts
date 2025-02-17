export const E2E_METRICS_ROOT = "e2e_metrics";
export const RAW_METRICS_DIR = `${E2E_METRICS_ROOT}/raw_data`;
export const METRICS_DIR = `${E2E_METRICS_ROOT}/processed`;

export interface PerformanceTestResult {
  testId: {
    name: string;
    screenSize: "small" | "large";
  };
  metrics: Record<string, number[]>;
}
