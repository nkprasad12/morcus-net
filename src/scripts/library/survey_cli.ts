/** Entry point for `./morcus.sh library survey`. */

export interface SurveyCliArgs {
  root?: string;
  label?: string;
  out?: string;
  writeSnapshot: boolean;
  only?: string;
}

export async function runSurveyCli(_args: SurveyCliArgs): Promise<boolean> {
  console.error("library survey: not implemented yet.");
  return false;
}
