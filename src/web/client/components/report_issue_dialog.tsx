import { useState } from "react";

import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";

import { callApi } from "@/web/utils/rpc/client_rpc";
import { ReportApi } from "@/web/api_routes";
import { getCommitHash } from "@/web/client/define_vars";

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
        className: "menu",
      }}
    >
      <DialogTitle style={{ fontSize: 19, lineHeight: "normal" }}>
        <b>Report an issue</b>
      </DialogTitle>
      <DialogContent>
        <DialogContentText style={{ fontSize: 16, lineHeight: "normal" }}>
          What did you do, what did you expect to see, and what did you actually
          see? <i>Do not enter personal information</i>.
        </DialogContentText>
        <TextField
          autoFocus
          margin="dense"
          onChange={(e) => {
            setReportText(e.target.value);
          }}
          defaultValue={`${window.location.href}\n`}
          fullWidth
          multiline
          minRows={8}
          variant="filled"
          inputProps={{ style: { fontSize: 16, lineHeight: "normal" } }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose} variant="text" color="info">
          Cancel
        </Button>
        <Button
          onClick={() => {
            const request = {
              reportText,
              commit: getCommitHash(),
            };
            callApi(ReportApi, request).catch(() => {});
            props.onClose();
          }}
          variant="contained"
        >
          <b>Submit</b>
        </Button>
      </DialogActions>
    </Dialog>
  );
}
