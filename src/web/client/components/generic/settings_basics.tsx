import {
  CheckBox,
  type CheckBoxProps,
} from "@/web/client/components/generic/basics";
import { usePersistedState } from "@/web/client/utils/hooks/persisted_state";
import { useUnchangeable } from "@/web/client/utils/indexdb/hooks";

export interface StoredCheckBoxProps
  extends Omit<CheckBoxProps, "enabled" | "onNewValue"> {
  /**
   * Tag used to extends the label when storing the value. By
   * default, the label will be used alone, but if the label is
   * ambiguous then the tag can be supplied.
   */
  storageTag?: string;
  /** The initial value to display. */
  initial: boolean;
}

export function StoredCheckBox(props: StoredCheckBoxProps) {
  const key = useUnchangeable(props.label + (props.storageTag ?? ""));
  const [checked, setChecked] = usePersistedState<boolean>(props.initial, key);
  return <CheckBox {...props} enabled={checked} onNewValue={setChecked} />;
}
