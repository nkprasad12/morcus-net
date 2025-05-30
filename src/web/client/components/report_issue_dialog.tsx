import { useState } from "react";

import { SpanButton, TextField } from "@/web/client/components/generic/basics";
import { ModalDialog } from "@/web/client/components/generic/overlays";
import { reportIssue } from "@/web/client/components/report_util";

const DEFAULT_TEXT = `\n\nReporter: Anonymous`;

export function ReportIssueDialog(props: {
  show: boolean;
  onClose: () => unknown;
}) {
  const [reportText, setReportText] = useState<string>(DEFAULT_TEXT);

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
        <b>Issues / Feedback</b>
      </div>
      <div style={{ padding: "0px 24px 20px" }}>
        <p className="text sm light" style={{ lineHeight: "normal" }}>
          Report an issue or share any feedback about the site.{" "}
          <b>This report will be visible to the general public</b>. Update the
          `Reporter` if you want to be contacted for further clarification or
          updates in this issue.
        </p>
        <TextField
          id="Report issue box"
          autoFocus
          onNewValue={setReportText}
          defaultValue={DEFAULT_TEXT}
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
            reportIssue(reportText);
            props.onClose();
          }}
          className="button">
          <b>Submit</b>
        </SpanButton>
      </div>
    </ModalDialog>
  );
}
