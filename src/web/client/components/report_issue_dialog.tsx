import { useState } from "react";

import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";

import { callApi } from "@/web/utils/rpc/client_rpc";
import { ReportApi } from "@/web/api_routes";
import { getCommitHash } from "@/web/client/define_vars";
import { SpanButton, TextField } from "@/web/client/components/generic/basics";

export function ReportIssueDialog(props: {
  show: boolean;
  onClose: () => any;
}) {
  const [reportText, setReportText] = useState<string>("");

  return (
    <Dialog
      open={props.show}
      onClose={props.onClose}
      PaperProps={{
        className: "bgColor",
      }}>
      <DialogTitle style={{ fontSize: 19, lineHeight: "normal" }}>
        <label htmlFor="Report issue box">
          <b>Report an issue</b>
        </label>
      </DialogTitle>
      <div style={{ padding: "0px 24px 20px" }}>
        <p className="text sm light" style={{ lineHeight: "normal" }}>
          What did you do, what did you expect to see, and what did you actually
          see? <i>Do not enter personal information</i>.
        </p>
        <TextField
          id="Report issue box"
          autoFocus
          onNewValue={setReportText}
          defaultValue={`${window.location.href}\n`}
          fullWidth
          multiline
          minRows={8}
        />
      </div>
      <DialogActions className="text md light">
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
      </DialogActions>
    </Dialog>
  );
}
