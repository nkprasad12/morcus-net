import { useState } from "react";

import { useCorpusRouter } from "@/web/client/pages/corpus/corpus_router";
import { ModalDialog } from "@/web/client/components/generic/overlays";
import { useMediaQuery } from "@/web/client/utils/media_query";

export function CorpusSettingsDialog(props: {
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const { nav, route } = useCorpusRouter();
  const { contextLen, pageSize } = route;

  const [tempContextLen, setTempContextLen] = useState<number>(contextLen);
  const [tempPageSize, setTempPageSize] = useState<number>(pageSize);
  const [tempStrictMode, setTempStrictMode] = useState<boolean>(false);

  function onCloseDialog() {
    props.setOpen(false);
    nav.to((current) => ({
      ...current,
      contextLen: tempContextLen,
      pageSize: tempPageSize,
      strictMode: tempStrictMode,
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
        <label htmlFor="contextLen" className="text sm light">
          Context words (1-100):{" "}
        </label>
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
        <label htmlFor="pageSize" className="text sm light">
          Page size (10-100):{" "}
        </label>
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
        <br />
        <label
          htmlFor="strictMode"
          className="text sm light"
          style={{ marginRight: "8px" }}>
          Strict mode:
        </label>
        <input
          id="strictMode"
          type="checkbox"
          checked={tempStrictMode}
          onChange={(e) => setTempStrictMode(e.currentTarget.checked)}
          style={{ marginLeft: "8px" }}
        />
        <span className="text xs light" style={{ marginLeft: "8px" }}>
          For queries filtering lemmata or inflection categories, return only
          results that unambiguously match the query.
        </span>
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

function PreviewChip(props: {
  value: number | string;
  label: string;
  onClick: () => void;
}) {
  return (
    <>
      {props.label}{" "}
      <span
        className="text xs smallChip lsChip"
        style={{ cursor: "pointer" }}
        onClick={props.onClick}>
        {props.value}
      </span>
    </>
  );
}

export function SettingsPreview(props: {
  contextLen: number;
  pageSize: number;
  strictMode: string;
  openSettings: () => void;
}) {
  const isScreenTiny = useMediaQuery("(max-width: 400px)");

  return (
    <div
      className="text light xxs compact"
      style={{
        marginLeft: "6px",
        fontFamily: "monospace",
        letterSpacing: "0",
        marginRight: "12px",
        display: "inline-flex",
        alignItems: "start",
        flexDirection: "column",
      }}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          margin: "0.4em 0 0.2em 0",
        }}>
        <PreviewChip
          value={props.contextLen}
          label={isScreenTiny ? "Context" : "Context words"}
          onClick={props.openSettings}
        />
        <PreviewChip
          value={props.pageSize}
          label="Page size"
          onClick={props.openSettings}
        />
      </div>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          margin: "0.2em 0 0.4em 0",
        }}>
        <PreviewChip
          label="Inflection mode"
          value={props.strictMode}
          onClick={props.openSettings}
        />
      </div>
    </div>
  );
}
