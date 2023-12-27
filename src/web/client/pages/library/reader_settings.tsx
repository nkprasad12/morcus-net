import {
  SettingSlider,
  SettingsText,
} from "@/web/client/pages/library/reader_utils";

export interface ReaderSettingsProps {
  /** The scale to use for the elements in the reader. */
  scale: number;
  /** The total width setting for the reader. */
  totalWidth: number;
  /** A setter for the total width of the reader. */
  setTotalWidth: (width: number) => any;
  /** The width of the main column of the reader. */
  mainWidth: number;
  /** A setter for the width of the main column of the reader. */
  setMainWidth: (width: number) => any;
  /** The scale of the main column of the reader. */
  mainScale: number;
  /** A setter for the scale of the main column of the reader. */
  setMainScale: (width: number) => any;
  /** The scale of the side column of the reader. */
  sideScale: number;
  /** A setter for the scale of the side column of the reader. */
  setSideScale: (width: number) => any;
}
export function ReaderSettings(props: ReaderSettingsProps) {
  const {
    scale,
    totalWidth,
    setTotalWidth,
    mainWidth,
    setMainWidth,
    mainScale,
    setMainScale,
    sideScale,
    setSideScale,
  } = props;
  return (
    <>
      <details>
        <summary>
          <SettingsText message="Layout settings" scale={scale} />
        </summary>
        <SettingSlider
          value={totalWidth}
          setValue={setTotalWidth}
          label="Total width"
          min={0}
          max={3}
          step={1}
          scale={scale}
          disableLabels
        />
        <SettingSlider
          value={mainWidth}
          setValue={setMainWidth}
          label="Main width"
          min={32}
          max={80}
          step={8}
          scale={scale}
        />
      </details>
      <details>
        <summary>
          <SettingsText message="Main column settings" scale={scale} />
        </summary>
        <SettingSlider
          value={mainScale}
          setValue={setMainScale}
          label="Text size"
          tag="Main column"
          min={50}
          max={150}
          step={10}
          scale={scale}
        />
      </details>
      <details>
        <summary>
          <SettingsText message="Side column settings" scale={scale} />
        </summary>
        <SettingSlider
          value={sideScale}
          setValue={setSideScale}
          label="Text size"
          tag="Side column"
          min={50}
          max={150}
          step={10}
          scale={scale}
        />
      </details>
    </>
  );
}
