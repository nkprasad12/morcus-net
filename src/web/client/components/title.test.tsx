/**
 * @jest-environment jsdom
 */

import { TitleContext, TitleHandler } from "@/web/client/components/title";
import { RouterV2 } from "@/web/client/router/router_v2";
import { render, screen } from "@testing-library/react";
import user from "@testing-library/user-event";
import { useContext } from "react";

function TestApp() {
  const { nav } = RouterV2.useRouter();
  const title = useContext(TitleContext);

  return (
    <div
      onClick={() => {
        title.setCurrentDictWord("dumtaxat");
        nav.toPath("/dicts");
      }}>
      Click
    </div>
  );
}

describe("TitleHandler", () => {
  it("sets default title at start", () => {
    render(
      <RouterV2.Root>
        <TitleHandler>
          <TestApp />
        </TitleHandler>
      </RouterV2.Root>
    );

    expect(document.title).toBe("Morcus Latin Tools");
  });

  it("sets dictionary title", async () => {
    render(
      <RouterV2.Root>
        <TitleHandler>
          <TestApp />
        </TitleHandler>
      </RouterV2.Root>
    );

    await user.click(screen.getByText("Click"));

    expect(document.title).toBe("dumtaxat | Morcus Latin Tools");
  });
});
