/**
 * @jest-environment jsdom
 */

import { CopyLinkTooltip } from "@/web/client/pages/tooltips";
import { render, screen } from "@testing-library/react";
import user from "@testing-library/user-event";
import React from "react";

const TooltipChild = React.forwardRef<any>(function TooltipChild(fProps, fRef) {
  return (
    <span {...fProps} ref={fRef}>
      TooltipChild
    </span>
  );
});

describe("CopyLinkTooltip", () => {
  it("has expected happy path", async () => {
    const listener = jest.fn();
    render(
      <div>
        <CopyLinkTooltip
          forwarded={TooltipChild}
          message="TooltipContent"
          link="foo/bar"
          visibleListener={listener}
        />
        <span>Button</span>
      </div>
    );

    expect(screen.getByText("TooltipChild")).not.toBeNull();

    await user.click(screen.getByText("TooltipChild"));
    expect(screen.getByText("TooltipChild")).not.toBeNull();
    expect(listener).toHaveBeenLastCalledWith(true);

    await user.click(screen.getByText("Button"));
    expect(screen.getByText("TooltipChild")).not.toBeNull();
    expect(listener).toHaveBeenLastCalledWith(false);
  });
});
