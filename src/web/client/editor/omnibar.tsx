import { useCallback } from "react";

import { SearchBox } from "@/web/client/components/generic/search";
import type { HelpViewInformation } from "@/web/client/editor/help_types";

export const OMNIBAR_ID = "editor-omnibar";

interface OmnibarProps {
  onHelpRequested: (helpType: HelpViewInformation) => unknown;
  helpOptions: ReadonlyArray<HelpViewInformation>;
}

function getName(x: HelpViewInformation): string {
  return x.name;
}

function OmnibarOption(props: { option: HelpViewInformation }) {
  return (
    <span className="text md">
      {props.option.name}{" "}
      <i className="text sm light">{props.option.description}</i>
    </span>
  );
}

export function Omnibar(props: OmnibarProps) {
  const helpOptions = useCallback(() => props.helpOptions, [props.helpOptions]);

  return (
    <SearchBox<HelpViewInformation>
      id={OMNIBAR_ID}
      placeholderText="type / in the editor for help"
      optionsForInput={helpOptions}
      toKey={getName}
      RenderOption={OmnibarOption}
      onOptionSelected={props.onHelpRequested}
      saveSpace
      hasOptionsForEmptyInput
    />
  );
}
