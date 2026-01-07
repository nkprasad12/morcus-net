export type HelpView = "dict" | "corpus";

export interface HelpViewInformation {
  name: HelpView;
  description: string;
}

export const HELP_VIEW_INFOS: Record<HelpView, HelpViewInformation> = {
  dict: {
    name: "dict",
    description: "Look up a word in the dictionary",
  },
  corpus: {
    name: "corpus",
    description: "Query the corpus",
  },
};

export const ALL_HELP_TYPE_INFOS: ReadonlyArray<HelpViewInformation> =
  Object.values(HELP_VIEW_INFOS);
