import { reloadIfOldClient } from "@/web/client/components/page_utils";
import { getCommitHash } from "@/web/client/define_vars";

const mockReload = jest.fn();
// @ts-ignore
const mockClientCommit: jest.Mock<any, any, any> = getCommitHash;
// @ts-ignore
global.location = {
  reload: mockReload,
};

jest.mock("@/web/client/define_vars");

describe("reload if needed", () => {
  beforeEach(() => {
    mockReload.mockClear();
  });

  test("does not reload on undefined server commit", () => {
    mockClientCommit.mockReturnValue(undefined);
    reloadIfOldClient({ data: {}, metadata: { commit: undefined } });

    expect(mockReload).not.toHaveBeenCalled();
  });

  test("does not reload on undefined client commit", () => {
    mockClientCommit.mockReturnValue("undefined");
    reloadIfOldClient({ data: {}, metadata: { commit: "undefined" } });

    expect(mockReload).not.toHaveBeenCalled();
  });

  test("does not reload on equal values", () => {
    mockClientCommit.mockReturnValue("caesar");
    reloadIfOldClient({ data: {}, metadata: { commit: "caesar" } });

    expect(mockReload).not.toHaveBeenCalled();
  });

  test("does reload on unequal values", () => {
    mockClientCommit.mockReturnValue("julius");
    reloadIfOldClient({ data: {}, metadata: { commit: "caesar" } });

    expect(mockReload).toHaveBeenCalled();
  });
});
