import { processWords } from "@/common/text_cleaning";
import {
  BaseMainColumnProps,
  BaseReader,
} from "@/web/client/pages/library/base_reader";
import {
  ReaderInternalNavbar,
  ReaderInternalTabConfig,
} from "@/web/client/pages/library/reader_sidebar_components";

import { PropsWithChildren, useEffect, useState } from "react";
import { exhaustiveGuard } from "@/common/misc_utils";
import React from "react";
import { ContentBox } from "@/web/client/pages/dictionary/sections";
import { SpanButton, TextField } from "@/web/client/components/generic/basics";
import {
  SavedContentHandler,
  useSavedExternalContent,
} from "@/web/client/pages/library/external_content_storage";
import { callApi } from "@/web/utils/rpc/client_rpc";
import { ScrapeUrlApi } from "@/web/api_routes";
import { Router } from "@/web/client/router/router_v2";
import { CopyLinkTooltip } from "@/web/client/pages/tooltips";
import { NavIcon } from "@/web/client/pages/library/reader_utils";
import { SvgIcon } from "@/web/client/components/generic/icons";

export function ExternalContentReader() {
  return (
    <BaseReader<MainColumnProps>
      MainColumn={MainColumn}
      dictActionMessage="Click on"
    />
  );
}

const READER_LOADING = 1;
const READER_ERROR = 2;
type ReaderTextState =
  | string
  | null
  | typeof READER_LOADING
  | typeof READER_ERROR;
interface InternalReaderState extends SavedContentHandler {
  processedText: JSX.Element | null;
  text: ReaderTextState;
  setText: (state: ReaderTextState) => unknown;
  setCurrentTab: (tab: MainTab) => unknown;
}
const DEFAULT_INTERNAL_STATE: InternalReaderState = {
  processedText: null,
  text: null,
  setText: () => {},
  setCurrentTab: () => {},
  contentIndex: undefined,
  deleteContent: () => Promise.reject(),
  saveContent: () => Promise.reject(),
  loadContent: () => Promise.reject(),
};
const InternalReaderContext: React.Context<InternalReaderState> =
  React.createContext(DEFAULT_INTERNAL_STATE);

type MainTab = "Load text" | "Text reader";
const LOAD_ICON: ReaderInternalTabConfig<MainTab> = {
  Icon: <SvgIcon pathD={SvgIcon.Edit} />,
  tab: "Load text",
};
const READER_ICON: ReaderInternalTabConfig<MainTab> = {
  Icon: <SvgIcon pathD={SvgIcon.AutoStories} />,
  tab: "Text reader",
};
const BASE_ICONS = [LOAD_ICON];
const LOADED_ICONS = [LOAD_ICON, READER_ICON];

const LOAD_PENDING = <span>Loading text from URL ...</span>;
const LOAD_ERROR = <span>Error loading from URL!</span>;

interface MainColumnProps {}
function MainColumn(props: MainColumnProps & BaseMainColumnProps) {
  const { route } = Router.useRouter();
  const [currentTab, setCurrentTab] = useState<MainTab>("Load text");
  const [text, setText] = useState<ReaderTextState>(null);
  const savedContentHandler = useSavedExternalContent();
  const mainColumnRef = React.useRef<HTMLDivElement>(null);

  const { onWordSelected, isMobile } = props;

  const fromUrl = route.params?.fromUrl;
  const loadContent = savedContentHandler.loadContent;
  const saveContent = savedContentHandler.saveContent;

  const processedText = React.useMemo(() => {
    if (text === null || text === READER_LOADING || text === READER_ERROR) {
      return null;
    }
    return processedTextComponent(text, onWordSelected);
  }, [text, onWordSelected]);

  const onNewTextState = React.useCallback(
    (input: ReaderTextState) => {
      setText(input);
      if (typeof input !== "string") {
        return;
      }
      setCurrentTab("Text reader");
      if (isMobile) {
        window.scrollTo({ top: 0, behavior: "instant" });
        window.scrollTo({ top: 64, behavior: "instant" });
      }
    },
    [setText, setCurrentTab, isMobile]
  );

  useEffect(() => {
    if (fromUrl === undefined) {
      return;
    }
    setCurrentTab("Text reader");
    setText(READER_LOADING);
    loadContent(fromUrl)
      .then((content) => onNewTextState(content.content))
      .catch(() => {
        callApi(ScrapeUrlApi, fromUrl)
          .then((scraped) => {
            saveContent({
              title: fromUrl,
              content: scraped,
              source: "fromUrl",
            });
            onNewTextState(scraped);
          })
          .catch(() => setText(READER_ERROR));
      });
  }, [fromUrl, onNewTextState, loadContent, saveContent]);

  return (
    <ContentBox
      contentRef={mainColumnRef}
      isSmall
      mt={props.isMobile ? 0 : undefined}
      className={props.isMobile ? "extReaderMobile" : undefined}>
      <ReaderInternalNavbar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        tabs={text !== null ? LOADED_ICONS : BASE_ICONS}
      />
      <div
        style={{
          paddingLeft: props.isMobile ? "12px" : undefined,
          paddingRight: props.isMobile ? "12px" : undefined,
        }}>
        <InternalReaderContext.Provider
          value={{
            text,
            processedText,
            setCurrentTab,
            setText: onNewTextState,
            ...savedContentHandler,
          }}>
          <RenderTab current={currentTab} />
        </InternalReaderContext.Provider>
      </div>
    </ContentBox>
  );
}

const ShareScrapedContentIcon = React.forwardRef<HTMLSpanElement>(
  function ShareScrapedContentIcon(fProps, fRef) {
    return (
      <span {...fProps} ref={fRef} style={{ marginLeft: "4px" }}>
        <NavIcon
          Icon={<SvgIcon pathD={SvgIcon.Link} />}
          label="share page link"
        />
      </span>
    );
  }
);

function RenderTab(props: { current: MainTab }) {
  const { route } = Router.useRouter();
  const { text, processedText } = React.useContext(InternalReaderContext);

  const tab = props.current;
  const fromUrl = route.params?.fromUrl;
  const validText = processedText !== null;

  switch (tab) {
    case "Load text":
      return (
        <div>
          <div className="text md" style={{ marginTop: "12px" }}>
            [Beta] External Content Reader
          </div>
          <div className="text sm light">
            Import Latin text and read it with definitions and inflection
            lookups provided upon click.
          </div>
          <div className="text sm light">Other import types coming soon.</div>
          <ExternalContentSection header="Load Previous Import" open>
            <PreviouslyEnteredSection />
          </ExternalContentSection>
          <ExternalContentSection header="Import Raw Text">
            <InputContentBox />
          </ExternalContentSection>
          <ExternalContentSection header="Import From URL [Beta]">
            <LinkImportSection />
          </ExternalContentSection>
        </div>
      );
    case "Text reader":
      return (
        <div>
          <div style={{ paddingTop: "8px", paddingBottom: "8px" }}>
            <span className="text sm light">Reading imported text</span>
            {validText && fromUrl && (
              <CopyLinkTooltip
                forwarded={ShareScrapedContentIcon}
                message="Copy link"
                link={window.location.href}
                placement="bottom"
              />
            )}
          </div>
          <span className="text md">
            {text === "Error"
              ? LOAD_ERROR
              : text === "Loading"
              ? LOAD_PENDING
              : processedText}
          </span>
        </div>
      );
    default:
      exhaustiveGuard(tab);
  }
}

function ExternalContentSection(
  props: PropsWithChildren<{ header: string; open?: boolean }>
) {
  return (
    <div style={{ marginTop: "8px" }}>
      <details open={props.open}>
        <summary className="text md light">{props.header}</summary>
        {props.children}
      </details>
    </div>
  );
}

function PreviouslyEnteredSection() {
  const { setText, contentIndex, deleteContent, loadContent, setCurrentTab } =
    React.useContext(InternalReaderContext);
  const { nav } = Router.useRouter();

  if (contentIndex === undefined) {
    return <div className="text sm">Loading saved imports</div>;
  }

  if (contentIndex.length === 0) {
    return <div className="text sm">No saved imports</div>;
  }

  return (
    <div style={{ display: "grid" }} className="text md">
      {contentIndex.map((item, i) => (
        <React.Fragment key={item.storageKey}>
          <span style={{ gridRow: i + 1, gridColumn: 1, maxWidth: "80%" }}>
            <SpanButton
              className={
                item.title.startsWith("http") ? "latWork fromUrl" : "latWork"
              }
              onClick={async () => {
                if (item.source === "fromUrl") {
                  nav.to((old) => ({
                    path: old.path,
                    params: { fromUrl: item.title },
                  }));
                  setCurrentTab("Text reader");
                } else {
                  const result = await loadContent(item.storageKey);
                  setText(result.content);
                  nav.to((old) => ({ path: old.path }));
                }
              }}>
              {item.title}
            </SpanButton>
          </span>
          <span style={{ gridRow: i + 1, gridColumn: 2, marginTop: "14px" }}>
            <SpanButton
              className="text sm light button warn"
              onClick={() => deleteContent(item.storageKey)}>
              Delete
            </SpanButton>
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

function InputContentBox() {
  const { setText, saveContent } = React.useContext(InternalReaderContext);
  const { nav } = Router.useRouter();

  const [titleText, setTitleText] = React.useState("");
  const [pendingText, setPendingText] = React.useState("");

  return (
    <>
      <div
        className="text sm light"
        style={{ marginTop: "8px", marginBottom: "8px" }}>
        <label htmlFor="title-input">Title</label>
        <span className="text red">*</span>
      </div>
      <TextField onNewValue={setTitleText} id="title-input" />
      <div
        className="text sm light"
        style={{ marginTop: "8px", marginBottom: "8px" }}>
        <label htmlFor="text-input">Text to import</label>
        <span className="text red">*</span>
      </div>
      <TextField
        fullWidth
        multiline
        minRows={10}
        onNewValue={setPendingText}
        id="text-input"
      />
      <button
        aria-label="Import text"
        className="button text md"
        disabled={titleText.length === 0 || pendingText.length === 0}
        onClick={() => {
          setText(pendingText);
          saveContent({ title: titleText, content: pendingText });
          nav.to((old) => ({ path: old.path }));
        }}
        style={{ marginTop: "16px" }}>
        Import
      </button>
    </>
  );
}

type LinkProcessState = "Processing" | "Error" | "None";

function LinkImportSection() {
  const { saveContent } = React.useContext(InternalReaderContext);
  const { nav } = Router.useRouter();

  const [sourceLink, setSourceLink] = useState<string>("");
  const [processState, setProcessState] = useState<LinkProcessState>("None");

  return (
    <>
      <div className="text sm">
        Import Latin text from another website. Works best for simple sites with
        mostly plain text.
      </div>
      <div className="text sm">
        These imports can be shared with other users!
      </div>
      <div
        style={{
          marginTop: "8px",
          marginBottom: "8px",
        }}>
        <div className="text sm light">
          <label htmlFor="link-input">Page URL</label>
          <span className="text red">*</span>
        </div>
        <TextField onNewValue={setSourceLink} id="link-input" />
        <div>
          <button
            aria-label="Import from link"
            className="button text md"
            disabled={sourceLink.length < 3 || !sourceLink.includes(".")}
            style={{ marginTop: "4px" }}
            onClick={async () => {
              setProcessState("Processing");
              const currentLink = sourceLink;
              try {
                const scraped = await callApi(ScrapeUrlApi, currentLink);
                await saveContent({
                  title: currentLink,
                  content: scraped,
                  source: "fromUrl",
                });
                nav.to((old) => ({
                  path: old.path,
                  params: { fromUrl: currentLink },
                }));
                setProcessState("None");
              } catch {
                setProcessState("Error");
              }
            }}>
            Import
          </button>
          {processState !== "None" && (
            <span className="text md" style={{ marginLeft: "12px" }}>
              {processState}
            </span>
          )}
        </div>
      </div>
    </>
  );
}

function processedTextComponent(
  input: string,
  onWordSelected: (word: string) => unknown
) {
  let key = 0;
  const children = processWords(input, (word) => {
    key += 1;
    return (
      <span
        key={key}
        className="workLatWord"
        onClick={() => onWordSelected(word)}>
        {word}
      </span>
    );
  });
  return <span>{children}</span>;
}
