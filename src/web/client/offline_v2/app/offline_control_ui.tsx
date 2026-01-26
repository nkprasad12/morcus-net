/* istanbul ignore file */

import { useState, useEffect } from "react";

import { InitialSetupUi } from "@/web/client/offline_v2/app/initial_setup_ui";
import {
  IndexedDbDict,
  LS_CONFIG,
  SH_CONFIG,
  type IndexDbDictConfig,
} from "@/common/dictionaries/indexdb_backing";
import { saveOfflineDict } from "@/web/client/offline_v2/app/offline_data";

type DictResource = "shDict" | "lsDict";

interface DictDownloadDetails {
  resourceName: DictResource;
  label: string;
  salesPitch: string;
  downloadSizeMb: number;
  dbConfig: IndexDbDictConfig;
}

const DICT_CONFIGS: Record<DictResource, DictDownloadDetails> = Object.freeze({
  shDict: {
    label: "Smith and Hall",
    salesPitch: "use S&H",
    downloadSizeMb: 10,
    resourceName: "shDict",
    dbConfig: SH_CONFIG,
  },
  lsDict: {
    label: "Lewis and Short",
    salesPitch: "use L&S",
    downloadSizeMb: 30,
    resourceName: "lsDict",
    dbConfig: LS_CONFIG,
  },
});

function DictDownloadCheckbox(props: { resourceName: DictResource }) {
  const [checked, setChecked] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [progress, setProgress] = useState<string | undefined>(undefined);

  const { label, downloadSizeMb, salesPitch, dbConfig } =
    DICT_CONFIGS[props.resourceName];

  const showDownloadInfo = !checked && downloadSizeMb !== undefined;

  return (
    <div>
      <div>
        <input
          id={label}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={async (e) => {
            const checked = e.currentTarget.checked;
            setProgress("In progress: please wait");
            setDisabled(true);
            if (!checked) {
              IndexedDbDict.deleteDict(dbConfig)
                .then(() => setProgress(undefined))
                .catch((e) => {
                  console.error("Error deleting dict:", e);
                  setProgress("An error occurred.");
                })
                .finally(() => {
                  setDisabled(false);
                  setChecked(false);
                });
              return;
            }
            saveOfflineDict(props.resourceName, dbConfig, (percent) => {
              setProgress(`In progress: ${percent}% complete`);
            })
              .then(() => {
                setChecked(true);
                setProgress(undefined);
              })
              .catch((e) => {
                console.error("Error downloading dict:", e);
                setProgress("An error occurred.");
              })
              .finally(() => setDisabled(false));
          }}
        />
        <label
          className={"nonDictText text sm"}
          htmlFor={label}
          style={{ paddingLeft: 8 }}>
          {label}
        </label>
      </div>
      <div className="nonDictText text xs light">
        <div>
          {checked ? "You can" : "Check to"} {salesPitch} offline.
        </div>
        {progress ? (
          <div>{progress}</div>
        ) : (
          showDownloadInfo && <div>Download Size: {downloadSizeMb} MB.</div>
        )}
      </div>
    </div>
  );
}

export function OfflineControlUi() {
  const [serviceWorkerActive, setServiceWorkerActive] = useState(false);

  useEffect(() => {
    navigator.serviceWorker
      ?.getRegistration()
      .then((reg) =>
        setServiceWorkerActive(reg !== undefined && reg.active !== null)
      );
  }, [serviceWorkerActive]);

  return (
    <>
      <InitialSetupUi
        isEnabled={serviceWorkerActive}
        setIsEnabled={setServiceWorkerActive}
      />
      {serviceWorkerActive && (
        <>
          <DictDownloadCheckbox resourceName="shDict" />
          <DictDownloadCheckbox resourceName="lsDict" />
        </>
      )}
    </>
  );
}
