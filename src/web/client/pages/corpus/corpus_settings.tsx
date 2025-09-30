import { useState } from "react";

import { useCorpusRouter } from "@/web/client/pages/corpus/corpus_router";
import { ModalDialog } from "@/web/client/components/generic/overlays";

export function CorpusSettingsDialog(props: {
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const { nav, route } = useCorpusRouter();
  const { contextLen, pageSize } = route;

  const [tempContextLen, setTempContextLen] = useState<number>(contextLen);
  const [tempPageSize, setTempPageSize] = useState<number>(pageSize);

  function onCloseDialog() {
    props.setOpen(false);
    nav.to((current) => ({
      ...current,
      contextLen: tempContextLen,
      pageSize: tempPageSize,
    }));
  }

  return (
    <ModalDialog
      open={props.open}
      onClose={onCloseDialog}
      contentProps={{ className: "bgColor" }}>
      <div className="text md" style={{ margin: 0, padding: "16px 24px" }}>
        <b>Corpus Query Settings</b>
      </div>
      <div style={{ padding: "0px 24px 20px" }}>
        <label htmlFor="contextLen">Context length (1-100): </label>
        <input
          id="contextLen"
          type="number"
          min={1}
          max={100}
          value={tempContextLen}
          onChange={(e) => {
            const val = Math.max(
              1,
              Math.min(100, Number(e.currentTarget.value))
            );
            setTempContextLen(val);
          }}
          style={{ width: "60px", marginLeft: "8px" }}
        />
        <br />
        <label htmlFor="pageSize">Page size (10-100): </label>
        <input
          id="pageSize"
          type="number"
          min={10}
          max={100}
          value={tempPageSize}
          onChange={(e) => {
            const val = Math.max(
              10,
              Math.min(100, Number(e.currentTarget.value))
            );
            setTempPageSize(val);
          }}
          style={{ width: "60px", marginLeft: "8px" }}
        />
      </div>
      <div
        className="dialogActions text md light"
        style={{ padding: "0px 24px 16px" }}>
        <button type="button" className="button simple" onClick={onCloseDialog}>
          Apply
        </button>
      </div>
    </ModalDialog>
  );
}

export function SettingsPreview(props: {
  contextLen: number;
  pageSize: number;
}) {
  return (
    <span
      className="text light xxs compact"
      style={{
        marginLeft: "6px",
        fontFamily: "monospace",
        letterSpacing: "0",
        marginRight: "12px",
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
      }}>
      <span
        className="text xs smallChip"
        style={{
          backgroundColor: "#eee",
          padding: "2px 8px",
          borderRadius: "8px",
          marginRight: "4px",
        }}>
        Context Size: {props.contextLen} words
      </span>
      <span
        className="text xs smallChip"
        style={{
          backgroundColor: "#eee",
          padding: "2px 8px",
          borderRadius: "8px",
        }}>
        Page size: {props.pageSize} results
      </span>
    </span>
  );
}
