/**
 * @jest-environment jsdom
 */

import {
  Navigation,
  RouteContext,
  Router,
} from "@/web/client/components/router";
import { TitleContext, TitleHandler } from "@/web/client/components/title";
import { render, screen } from "@testing-library/react";
import user from "@testing-library/user-event";
import { useContext } from "react";

function TestApp() {
  const nav = useContext(RouteContext);
  const title = useContext(TitleContext);

  return (
    <div
      onClick={() => {
        title.setCurrentDictWord("dumtaxat");
        Navigation.to(nav, "/dicts");
      }}>
      Click
    </div>
  );
}

describe("TitleHandler", () => {
  it("sets default title at start", () => {
    render(
      <Router.Handler>
        <TitleHandler>
          <TestApp />
        </TitleHandler>
      </Router.Handler>
    );

    expect(document.title).toBe("Morcus Latin Tools");
  });

  it("sets dictionary title", async () => {
    render(
      <Router.Handler>
        <TitleHandler>
          <TestApp />
        </TitleHandler>
      </Router.Handler>
    );

    await user.click(screen.getByText("Click"));

    expect(document.title).toBe("dumtaxat | Morcus Latin Tools");
  });
});
