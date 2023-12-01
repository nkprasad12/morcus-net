import { LibraryWorkMetadata } from "@/common/library/library_types";
import { ListLibraryWorks } from "@/web/api_routes";
import { reloadIfOldClient } from "@/web/client/components/page_utils";
import { Navigation, RouteContext } from "@/web/client/components/router";
import { ContentBox } from "@/web/client/pages/dictionary/sections";
import { WORK_PAGE } from "@/web/client/pages/library/common";
import { callApiFull } from "@/web/utils/rpc/client_rpc";
import Container from "@mui/material/Container";
import React, { useEffect } from "react";

export function Library() {
  const nav = React.useContext(RouteContext);
  const [works, setWorks] = React.useState<LibraryWorkMetadata[] | undefined>(
    undefined
  );

  useEffect(() => {
    callApiFull(ListLibraryWorks, true).then((result) => {
      reloadIfOldClient(result);
      setWorks(result.data);
    });
  }, []);

  function onWorkSelected(workId: string) {
    Navigation.to(nav, `${WORK_PAGE}/${workId}`);
  }

  function WorksList() {
    if (works === undefined) {
      return <span>Loading titles ...</span>;
    }
    return (
      <div>
        {works.map((work) => (
          <span
            key={work.id}
            className="latWork"
            style={{ paddingLeft: 8 }}
            onClick={() => onWorkSelected(work.id)}
          >{`${work.name} [${work.author}]`}</span>
        ))}
      </div>
    );
  }

  return (
    <Container maxWidth="xxl" sx={{ paddingTop: 3 }}>
      <ContentBox isSmall={false}>
        <>
          <div>Welcome to the library.</div>
          <div>Select a work from the list below.</div>
          <WorksList />
        </>
      </ContentBox>
    </Container>
  );
}
