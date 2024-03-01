import { useState } from "react";

import { callApi } from "@/web/utils/rpc/client_rpc";
import { ReportApi } from "@/web/api_routes";
import { getCommitHash } from "@/web/client/define_vars";
import { SpanButton, TextField } from "@/web/client/components/generic/basics";
import { ModalDialog } from "@/web/client/components/generic/overlays";

export function ReportIssueDialog(props: {
  show: boolean;
  onClose: () => any;
}) {
  const [reportText, setReportText] = useState<string>("");

  return (
    <ModalDialog
      open={props.show}
      onClose={props.onClose}
      aria-labelledby="reportTitle"
      contentProps={{
        className: "bgColor",
      }}>
      <div
        id="reportTitle"
        className="text md"
        style={{ lineHeight: "normal", margin: 0, padding: "16px 24px" }}>
        <b>Report an issue</b>
      </div>
      <div style={{ padding: "0px 24px 20px" }}>
        <p className="text sm light" style={{ lineHeight: "normal" }}>
          What did you do, what did you expect to see, and what did you actually
          see? <i>This report will be visible to the general public</i>.
        </p>
        <TextField
          id="Report issue box"
          autoFocus
          onNewValue={setReportText}
          defaultValue={`\n\nReporter: Anonymous (change this to be notified when your issue is fixed)\n${window.location.href}`}
          fullWidth
          multiline
          minRows={8}
        />
      </div>
      <div className="dialogActions text md light">
        <SpanButton onClick={props.onClose} className="button simple">
          Cancel
        </SpanButton>
        <SpanButton
          onClick={() => {
            const request = {
              reportText,
              commit: getCommitHash(),
            };
            callApi(ReportApi, request).catch(() => {});
            props.onClose();
          }}
          className="button">
          <b>Submit</b>
        </SpanButton>
      </div>
    </ModalDialog>
  );
}
