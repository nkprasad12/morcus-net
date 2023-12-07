import { LibraryWorkMetadata } from "@/common/library/library_types";
import { ListLibraryWorks } from "@/web/api_routes";
import { reloadIfOldClient } from "@/web/client/components/page_utils";
import { Navigation, RouteContext } from "@/web/client/components/router";
import { ContentBox } from "@/web/client/pages/dictionary/sections";
import { WORK_PAGE } from "@/web/client/pages/library/common";
import { callApiFull } from "@/web/utils/rpc/client_rpc";
import Container from "@mui/material/Container";
import { useContext, useState, useEffect } from "react";

function WorksList(props: { works: undefined | LibraryWorkMetadata[] }) {
  const nav = useContext(RouteContext);

  if (props.works === undefined) {
    return <span>Loading titles ...</span>;
  }

  return (
    <div>
      {props.works.map((work) => (
        <span
          key={work.id}
          className="latWork"
          style={{ paddingLeft: 8 }}
          onClick={() => Navigation.to(nav, `${WORK_PAGE}/${work.id}`)}
        >{`${work.name} [${work.author}]`}</span>
      ))}
    </div>
  );
}

export function Library() {
  const [works, setWorks] = useState<LibraryWorkMetadata[] | undefined>(
    undefined
  );

  useEffect(() => {
    callApiFull(ListLibraryWorks, true).then((result) => {
      reloadIfOldClient(result);
      setWorks(result.data);
    });
  }, []);

  return (
    <Container maxWidth="xxl" sx={{ paddingTop: 3 }}>
      <ContentBox isSmall={false}>
        <>
          <div>Welcome to the library.</div>
          <div>Select a work from the list below.</div>
          <WorksList works={works} />
        </>
      </ContentBox>
    </Container>
  );
}
