import LinkIcon from "@mui/icons-material/Link";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { CSSProperties } from "react";
import * as React from "react";

import { EntryOutline } from "@/common/dictionaries/dict_result";
import {
  DictInfo,
  DictsFusedResponse,
} from "@/common/dictionaries/dictionaries";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { DictsFusedApi } from "@/web/api_routes";
import { Footer } from "@/web/client/components/footer";
import { GlobalSettingsContext } from "@/web/client/components/global_flags";
import { RouteContext } from "@/web/client/components/router";
import { FullDictChip } from "@/web/client/pages/dictionary/dict_chips";
import {
  ElementAndKey,
  HELP_ENTRY,
  InflectionDataSection,
  QUICK_NAV_ANCHOR,
  QNA_EMBEDDED,
  SCROLL_JUMP,
  SCROLL_SMOOTH,
  SearchSettings,
  xmlNodeToJsx,
} from "@/web/client/pages/dictionary/dictionary_utils";
import { QuickNavMenu } from "@/web/client/pages/dictionary/quick_nav";
import { DictionarySearch } from "@/web/client/pages/dictionary/search/dictionary_search";
import {
  ContentBox,
  DictAttribution,
} from "@/web/client/pages/dictionary/sections";
import {
  TableOfContentsV2,
  jumpToSection,
} from "@/web/client/pages/dictionary/table_of_contents_v2";
import { SectionLinkTooltip } from "@/web/client/pages/tooltips";
import { callApiFull } from "@/web/utils/rpc/client_rpc";
import ReactDOM, { flushSync } from "react-dom";
import { TitleContext } from "../../components/title";
import { reloadIfOldClient } from "@/web/client/components/page_utils";
import { FontSizes } from "@/web/client/styles";
import { DictContext } from "@/web/client/pages/dictionary/dict_context";

export const ERROR_STATE_MESSAGE =
  "Lookup failed. Please check your internet connection" +
  " and / or refresh the page (or if using the app, close and re-open)." +
  " If the issue persists, contact Mórcus.";
export const NO_RESULTS_MESSAGE =
  "No results found. If applicable, try enabling another " +
  "dictionary in settings.";

const TOC_SIDEBAR_STYLE: CSSProperties = {
  position: "sticky",
  zIndex: 1,
  top: 0,
  left: 0,
  marginTop: 10,
  overflow: "auto",
  maxHeight: window.innerHeight - 40,
  minWidth: "min(29%, 300px)",
};

async function fetchEntry(
  input: string,
  experimentalMode: boolean,
  singleArticle: boolean,
  embedded: boolean
) {
  const parts = input.split(",");
  const dictParts = parts.slice(1).map((part) => part.replace("n", "&"));
  const dicts = embedded
    ? LatinDict.AVAILABLE.filter((dict) => dict.languages.from === "La")
    : parts.length > 1
    ? LatinDict.AVAILABLE.filter((dict) => dictParts.includes(dict.key))
    : LatinDict.AVAILABLE;
  const result = callApiFull(DictsFusedApi, {
    query: parts[0],
    dicts: dicts.map((dict) => dict.key),
    mode: singleArticle ? 2 : experimentalMode || embedded ? 1 : 0,
  });
  try {
    return await result;
  } catch (reason) {
    console.debug(reason);
    return null;
  }
}

const noSsr = { noSsr: true };

type EdgeCaseState = "Landing" | "Error" | "No Results";
type DictState = EdgeCaseState | "Loading" | "Results";

function HorizontalPlaceholder() {
  return (
    <span key={"horizonatalSpacePlaceholder"} className="dictPlaceholder">
      {"pla ceh old er".repeat(20)}
    </span>
  );
}

function NoResultsContent(props: { isSmall: boolean; dicts: DictInfo[] }) {
  const labels =
    props.dicts.length > 0 ? props.dicts.map((d) => d.displayName) : ["None"];
  return (
    <ContentBox isSmall={props.isSmall}>
      <>
        <div>{NO_RESULTS_MESSAGE}</div>
        <div>
          Enabled dictionaries:{" "}
          {labels.map((label) => (
            <span key={label}>
              <FullDictChip label={label} />{" "}
            </span>
          ))}
        </div>
      </>
    </ContentBox>
  );
}

function ErrorContent(props: { isSmall: boolean }) {
  return (
    <ContentBox isSmall={props.isSmall}>
      <div>{ERROR_STATE_MESSAGE}</div>
    </ContentBox>
  );
}

function getEntriesByDict(
  response: DictsFusedResponse,
  sectionRef: React.RefObject<HTMLElement>,
  hash: string | undefined,
  isEmbedded: boolean
): EntriesByDict[] {
  const result: EntriesByDict[] = [];
  for (const dictKey in response) {
    const rawEntries = response[dictKey];
    const entries = rawEntries.map((e, i) => ({
      element: xmlNodeToJsx(e.entry, hash, sectionRef, undefined, isEmbedded),
      key: e.entry.getAttr("id") || `${dictKey}${i}`,
      inflections: e.inflections,
    }));
    const outlines = rawEntries.map((e) => e.outline);
    const name = LatinDict.BY_KEY.get(dictKey)?.displayName || dictKey;
    result.push({ dictKey, name, entries, outlines });
  }
  return result;
}

interface EntriesByDict {
  dictKey: string;
  name: string;
  entries: ElementAndKey[];
  outlines: EntryOutline[];
}

interface PassthroughSearchBarProps {
  className?: string;
  dictsToUse: DictInfo[];
  setDictsToUse: (dicts: DictInfo[]) => any;
  scrollTopRef: React.RefObject<HTMLDivElement>;
}
interface SearchBarProps extends PassthroughSearchBarProps {
  maxWidth: "md" | "lg" | "xl";
  marginLeft?: "auto" | "0";
  id?: string;
}
function SearchBar(props: SearchBarProps) {
  const { isEmbedded, isSmall } = React.useContext(DictContext);
  if (isEmbedded) {
    return <></>;
  }
  return (
    <Container
      maxWidth={props.maxWidth}
      disableGutters
      ref={props.scrollTopRef}
      sx={{ marginLeft: props.marginLeft || "auto" }}
      id={props.id}
      className={props.className}
    >
      <DictionarySearch
        smallScreen={isSmall}
        dicts={props.dictsToUse}
        setDicts={(newDicts) => {
          SearchSettings.store(newDicts);
          props.setDictsToUse(newDicts);
        }}
      />
    </Container>
  );
}

function ToEntryButton(props: { outline: EntryOutline; scale: number }) {
  const { scale } = props;
  const label = ` ${props.outline.mainLabel || props.outline.mainKey} `;
  return (
    <span
      className="lsSenseBullet"
      style={{
        marginLeft: 3,
        cursor: "pointer",
        whiteSpace: "nowrap",
        fontWeight: "normal",
      }}
      onClick={() => jumpToSection(props.outline.mainSection.sectionId)}
    >
      <OpenInNewIcon
        sx={{
          marginBottom: `${-0.1 * scale}em`,
          marginRight: `${-0.1 * scale}em`,
          fontSize: `${0.8 * scale}em`,
          paddingLeft: `${0.1 * scale}em`,
        }}
      />
      <span dangerouslySetInnerHTML={{ __html: label }} />
    </span>
  );
}

function HelpSection(props: { id?: string; className?: string }) {
  const { isEmbedded, isSmall, scale } = React.useContext(DictContext);
  const MainContent = (
    <div
      style={{
        fontSize: FontSizes.TERTIARY * scale,
        lineHeight: "normal",
      }}
    >
      {xmlNodeToJsx(HELP_ENTRY)}
    </div>
  );
  return (
    <ContentBox
      key="helpSection"
      isSmall={isSmall}
      id={props.id}
      className={props.className}
    >
      {isEmbedded ? (
        <details>
          <summary>
            <span
              className="contentTextLight"
              style={{ fontSize: FontSizes.SECONDARY * scale }}
            >
              Markup guide
            </span>
          </summary>
          {MainContent}
        </details>
      ) : (
        MainContent
      )}
    </ContentBox>
  );
}

function LoadingMessage(props: { isSmall: boolean; textScale?: number }) {
  return (
    <ContentBox isSmall={props.isSmall} textScale={props?.textScale}>
      <span>Loading entries, please wait ... </span>
    </ContentBox>
  );
}

function ResponsiveLayout(
  props: {
    oneCol?: JSX.Element;
    twoColSide?: JSX.Element;
    twoColMain?: JSX.Element;
  } & PassthroughSearchBarProps
) {
  const { isSmall } = React.useContext(DictContext);
  return isSmall ? (
    <OneColumnLayout {...props} Content={props.oneCol || <></>} />
  ) : (
    <TwoColumnLayout
      {...props}
      SidebarContent={props.twoColSide || <></>}
      MainContent={props.twoColMain || <></>}
    />
  );
}

function OneColumnLayout(
  props: { Content: JSX.Element } & PassthroughSearchBarProps
) {
  const { isEmbedded } = React.useContext(DictContext);
  const { dictsToUse, setDictsToUse, scrollTopRef } = props;
  return (
    <Container maxWidth="lg" disableGutters={isEmbedded}>
      <SearchBar
        maxWidth="lg"
        id={"SearchBox"}
        className={isEmbedded ? QNA_EMBEDDED : QUICK_NAV_ANCHOR}
        dictsToUse={dictsToUse}
        setDictsToUse={setDictsToUse}
        scrollTopRef={scrollTopRef}
      />
      {props.Content}
      <Footer
        id={"Footer"}
        className={isEmbedded ? QNA_EMBEDDED : QUICK_NAV_ANCHOR}
      />
    </Container>
  );
}

function TwoColumnLayout(
  props: {
    SidebarContent: JSX.Element;
    MainContent: JSX.Element;
  } & PassthroughSearchBarProps
) {
  const { dictsToUse, setDictsToUse, scrollTopRef } = props;
  return (
    <Container maxWidth="xl" sx={{ minHeight: window.innerHeight }}>
      <Stack direction="row" spacing={0} justifyContent="left">
        <div style={TOC_SIDEBAR_STYLE}>{props.SidebarContent}</div>
        <div style={{ maxWidth: "10000px" }}>
          <SearchBar
            maxWidth="md"
            marginLeft="0"
            dictsToUse={dictsToUse}
            setDictsToUse={setDictsToUse}
            scrollTopRef={scrollTopRef}
          />
          {props.MainContent}
          <HorizontalPlaceholder />
          <Footer />
        </div>
      </Stack>
    </Container>
  );
}

function SummarySection(props: {
  idSearch: boolean;
  entries: EntriesByDict[];
  scrollTopRef: React.RefObject<HTMLDivElement>;
}) {
  const { isEmbedded, isSmall, textScale, scale } =
    React.useContext(DictContext);
  const { idSearch, entries, scrollTopRef } = props;
  if (idSearch) {
    return <></>;
  }

  const numEntries = entries.reduce((s, c) => s + c.entries.length, 0);
  return (
    <ContentBox isSmall={isSmall} id="DictResultsSummary" textScale={textScale}>
      <>
        <div
          ref={isEmbedded ? scrollTopRef : undefined}
          style={{
            fontSize: isEmbedded ? FontSizes.BIG_SCREEN * scale : undefined,
          }}
        >
          Found {numEntries} {numEntries > 1 ? "entries" : "entry"}
        </div>
        {numEntries > 1 &&
          entries
            .filter((entry) => entry.outlines.length > 0)
            .map((entry) => (
              <div key={entry.dictKey + "SummarySection"}>
                <FullDictChip label={entry.name} textScale={textScale} />
                {entry.outlines.map((outline) => (
                  <span key={outline.mainSection.sectionId}>
                    {" "}
                    <ToEntryButton
                      outline={outline}
                      key={outline.mainSection.sectionId}
                      scale={scale}
                    />
                  </span>
                ))}
              </div>
            ))}
      </>
    </ContentBox>
  );
}

function articleLinkButton(text: string, scale: number) {
  function senseForwardedNode(forwardProps: any, forwardRef: any) {
    return (
      <span
        {...forwardProps}
        className="lsSenseBullet"
        ref={forwardRef}
        style={{
          paddingLeft: 1,
          marginRight: 5,
          paddingTop: 1,
          paddingBottom: 1,
          paddingRight: 4,
        }}
      >
        <LinkIcon
          sx={{
            marginBottom: `${-0.2 * scale}em`,
            marginRight: `${-0.2 * scale}em`,
            fontSize: `${1 * scale}em`,
            paddingLeft: `${0.2 * scale}em`,
            paddingRight: `${0.4 * scale}em`,
          }}
        />
        {`${text}`}
      </span>
    );
  }
  return React.forwardRef<HTMLElement>(senseForwardedNode);
}

function DictionaryEntries(props: { entries: EntriesByDict[] }) {
  const { isSmall, textScale, scale } = React.useContext(DictContext);
  return (
    <>
      {props.entries.map((entry) => (
        <SingleDictSection
          data={entry}
          key={`${entry.dictKey}EntrySection`}
          isSmall={isSmall}
          textScale={textScale}
          scale={scale}
        />
      ))}
    </>
  );
}

function SingleDictSection(props: {
  data: EntriesByDict;
  isSmall: boolean;
  textScale?: number;
  scale: number;
}) {
  const { isSmall, textScale, scale } = props;
  if (props.data.entries.length === 0) {
    return <></>;
  }
  return (
    <>
      {props.data.entries.map((entry, i) => (
        <ContentBox
          key={entry.key}
          isSmall={isSmall}
          id={entry.key}
          textScale={textScale}
        >
          <>
            {entry.inflections && (
              <InflectionDataSection
                inflections={entry.inflections}
                textScale={textScale}
              />
            )}
            <div style={{ marginBottom: 5, marginTop: 8 }}>
              <span>
                <SectionLinkTooltip
                  forwarded={articleLinkButton(
                    props.data.outlines[i].mainKey,
                    scale
                  )}
                  id={props.data.outlines[i].mainSection.sectionId}
                  forArticle
                />
                <FullDictChip label={props.data.name} textScale={textScale} />
              </span>
            </div>
            {entry.element}
          </>
        </ContentBox>
      ))}
      <DictAttribution
        isSmall={isSmall}
        dictKey={props.data.dictKey}
        textScale={textScale}
      />
    </>
  );
}

function TableOfContents(props: {
  entries: EntriesByDict[];
  tocRef: React.RefObject<HTMLElement>;
}) {
  const { isSmall, textScale } = React.useContext(DictContext);
  return (
    <>
      {props.entries.map((entry) => (
        <TableOfContentsV2
          dictKey={entry.dictKey}
          outlines={entry.outlines}
          isSmall={isSmall}
          tocRef={props.tocRef}
          key={entry.dictKey + "ToC"}
          textScale={textScale}
        />
      ))}
    </>
  );
}

export function DictionaryViewV2(props: {
  /** Whether the dictionary is embedded in another view. */
  embedded?: boolean;
  /** An initial query, if any. */
  initial?: string;
  /** The scale of the text size to use. 100 uses default text values */
  textScale?: number;
}) {
  const [state, setState] = React.useState<DictState>("Landing");
  const [entries, setEntries] = React.useState<EntriesByDict[]>([]);
  const [dictsToUse, setDictsToUse] = React.useState<DictInfo[]>(
    SearchSettings.retrieve()
  );

  const theme = useTheme();
  const isScreenSmall = useMediaQuery(theme.breakpoints.down("md"), noSsr);

  const sectionRef = React.useRef<HTMLElement>(null);
  const tocRef = React.useRef<HTMLElement>(null);
  const entriesRef = React.useRef<HTMLDivElement>(null);
  const scrollTopRef = React.useRef<HTMLDivElement>(null);

  const settings = React.useContext(GlobalSettingsContext);
  const nav = React.useContext(RouteContext);
  const title = React.useContext(TitleContext);

  const isEmbedded = props?.embedded === true;
  const isSmall = isEmbedded || isScreenSmall;
  const scale = (props?.textScale || 100) / 100;
  const textScale = props?.textScale;
  const idSearch = nav.route.idSearch === true;

  const { initial } = props;
  const query = isEmbedded ? initial : nav.route.query;

  React.useEffect(() => {
    if (query === undefined) {
      return;
    }
    setState("Loading");
    const serverResult = fetchEntry(
      query,
      settings.data.experimentalMode === true ||
        nav.route.experimentalSearch === true,
      idSearch,
      isEmbedded
    );
    serverResult.then((newResults) => {
      if (newResults === null) {
        setState("Error");
        return;
      }
      reloadIfOldClient(newResults);

      const allEntries = getEntriesByDict(
        newResults.data,
        sectionRef,
        nav.route.hash,
        isEmbedded
      );
      flushSync(() => {
        setEntries(allEntries);
        const numEntries = allEntries.reduce((s, c) => s + c.entries.length, 0);
        setState(numEntries === 0 ? "No Results" : "Results");
      });
      const scrollElement =
        sectionRef.current || (isEmbedded ? null : scrollTopRef.current);
      const scrollType =
        nav.route.internalSource === true || isEmbedded
          ? SCROLL_JUMP
          : scrollElement === scrollTopRef.current
          ? SCROLL_SMOOTH
          : SCROLL_JUMP;
      scrollElement?.scrollIntoView(scrollType);
    });
  }, [
    query,
    nav.route.hash,
    nav.route.experimentalSearch,
    nav.route.internalSource,
    idSearch,
    isEmbedded,
    settings.data.experimentalMode,
  ]);

  React.useEffect(() => {
    const filteredEntries = entries.filter(
      (entry) => entry.outlines.length > 0
    );
    if (!(state === "Results" && filteredEntries.length > 0)) {
      title.setCurrentDictWord("");
    } else {
      title.setCurrentDictWord(filteredEntries[0].outlines[0].mainKey);
    }
  }, [state, entries, title]);

  if (state === "Landing") {
    return (
      <DictContext.Provider value={{ isEmbedded, isSmall, scale, textScale }}>
        <ResponsiveLayout
          dictsToUse={dictsToUse}
          setDictsToUse={setDictsToUse}
          scrollTopRef={scrollTopRef}
        />
      </DictContext.Provider>
    );
  }

  if (state === "Error") {
    return (
      <DictContext.Provider value={{ isEmbedded, isSmall, scale, textScale }}>
        <ResponsiveLayout
          oneCol={<ErrorContent isSmall={isSmall} />}
          twoColMain={<ErrorContent isSmall={isSmall} />}
          dictsToUse={dictsToUse}
          setDictsToUse={setDictsToUse}
          scrollTopRef={scrollTopRef}
        />
      </DictContext.Provider>
    );
  }

  if (state === "No Results") {
    const noResults = <NoResultsContent isSmall={isSmall} dicts={dictsToUse} />;
    return (
      <DictContext.Provider value={{ isEmbedded, isSmall, scale, textScale }}>
        <ResponsiveLayout
          oneCol={noResults}
          twoColMain={noResults}
          dictsToUse={dictsToUse}
          setDictsToUse={setDictsToUse}
          scrollTopRef={scrollTopRef}
        />
      </DictContext.Provider>
    );
  }

  if (state === "Loading") {
    return (
      <DictContext.Provider value={{ isEmbedded, isSmall, scale, textScale }}>
        <ResponsiveLayout
          dictsToUse={dictsToUse}
          setDictsToUse={setDictsToUse}
          scrollTopRef={scrollTopRef}
          oneCol={<LoadingMessage isSmall={isSmall} textScale={textScale} />}
          twoColMain={
            <LoadingMessage isSmall={isSmall} textScale={textScale} />
          }
        />
      </DictContext.Provider>
    );
  }

  return (
    <DictContext.Provider value={{ isEmbedded, isSmall, scale, textScale }}>
      <ResponsiveLayout
        dictsToUse={dictsToUse}
        setDictsToUse={setDictsToUse}
        scrollTopRef={scrollTopRef}
        oneCol={
          <DictContext.Provider
            value={{ isEmbedded, isSmall, scale, textScale }}
          >
            {!isEmbedded &&
              ReactDOM.createPortal(<QuickNavMenu />, document.body)}
            <HelpSection
              id={"HelpSection"}
              className={isEmbedded ? QNA_EMBEDDED : QUICK_NAV_ANCHOR}
            />
            <div
              id={"Toc"}
              className={isEmbedded ? QNA_EMBEDDED : QUICK_NAV_ANCHOR}
            >
              <SummarySection
                scrollTopRef={scrollTopRef}
                idSearch={idSearch}
                entries={entries}
              />
              <TableOfContents entries={entries} tocRef={tocRef} />
            </div>
            <div ref={entriesRef}>
              <DictionaryEntries entries={entries} />
            </div>
          </DictContext.Provider>
        }
        twoColSide={
          <DictContext.Provider
            value={{ isEmbedded, isSmall, scale, textScale }}
          >
            <TableOfContents entries={entries} tocRef={tocRef} />
          </DictContext.Provider>
        }
        twoColMain={
          <DictContext.Provider
            value={{ isEmbedded, isSmall, scale, textScale }}
          >
            <HelpSection />
            <SummarySection
              scrollTopRef={scrollTopRef}
              idSearch={idSearch}
              entries={entries}
            />
            <DictionaryEntries entries={entries} />
          </DictContext.Provider>
        }
      />
    </DictContext.Provider>
  );
}
