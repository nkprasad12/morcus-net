/**
 * @jest-environment jsdom
 */

import { callApi } from "@/web/utils/rpc/client_rpc";
import {
  fetchWork,
  invalidateWorkCache,
} from "@/web/client/pages/library/work_cache";
import { beforeAll } from "@jest/globals";

jest.mock("@/web/utils/rpc/client_rpc");

// @ts-ignore
const mockCallApi: jest.Mock<any, any, any> = callApi;

function cleanup() {
  mockCallApi.mockClear();
  invalidateWorkCache();
}

describe("WorkCache", () => {
  beforeAll(cleanup);
  afterEach(cleanup);

  it("returns same result on successive calls", async () => {
    mockCallApi.mockResolvedValue("");

    await fetchWork("foo");
    await fetchWork("foo");

    expect(mockCallApi).toHaveBeenCalledTimes(1);
  });

  it("returns different results on different calls", async () => {
    mockCallApi.mockResolvedValue("");

    await fetchWork("foo");
    await fetchWork("bar");

    expect(mockCallApi).toHaveBeenCalledTimes(2);
  });

  it("retries on failed call", async () => {
    mockCallApi.mockRejectedValue("fail");

    const failed = fetchWork("foo");
    expect(failed).rejects.toBe("fail");
    try {
      await failed;
    } catch {}

    mockCallApi.mockResolvedValue("success");
    const succeeded = fetchWork("foo");

    expect(succeeded).resolves.toBe("success");
    expect(mockCallApi).toHaveBeenCalledTimes(2);
  });
});
