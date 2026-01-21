import { useEffect, useState } from "react";

import { SpanButton } from "@/web/client/components/generic/basics";
import { ModalDialog } from "@/web/client/components/generic/overlays";
import { SingleItemStore } from "@/web/client/offline_v2/app/single_item_store";
import { isBoolean } from "@/web/utils/rpc/parsing";
import { SvgIcon } from "@/web/client/components/generic/icons";

interface SimpleModalProps {
  onClose: () => unknown;
  message?: JSX.Element;
}
function SimpleModal(props: SimpleModalProps) {
  return (
    <ModalDialog
      contentProps={{ className: "bgColor" }}
      open={props.message !== undefined}
      onClose={props.onClose}>
      <div
        id="notificationModalTitle"
        className="text sm"
        style={{ fontWeight: "bold", margin: 0, padding: "12px 12px" }}>
        Offline Mode Enabled
      </div>
      <div style={{ padding: "0px 12px 12px" }} className="text sm">
        {props.message}
      </div>
      <div className="dialogActions">
        <SpanButton
          onClick={props.onClose}
          className="text sm light button simple">
          Close
        </SpanButton>
      </div>
    </ModalDialog>
  );
}

export function OfflineNotificationModal() {
  const [message, setMessage] = useState<JSX.Element | undefined>(undefined);

  useEffect(() => {
    const store = SingleItemStore.forKey("forcedOfflineMode", isBoolean);
    store.get().then(
      (forcedOfflineMode) => {
        if (!forcedOfflineMode) {
          return;
        }
        setMessage(
          <div>
            Because no network connection was detected, Offline Mode was
            automatically enabled. You can open settings and turn it back off
            using the{" "}
            <SvgIcon pathD={SvgIcon.OfflineEnabled} fontSize="small" /> button
            in the top bar.
          </div>
        );
        store.set(false);
      },
      () => {}
    );
  }, []);

  return (
    <SimpleModal message={message} onClose={() => setMessage(undefined)} />
  );
}
