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

  it("returns same result on successive calls with id", async () => {
    mockCallApi.mockResolvedValue("");

    await fetchWork({ id: "foo" });
    await fetchWork({ id: "foo" });

    expect(mockCallApi).toHaveBeenCalledTimes(1);
  });

  it("returns same result on successive calls with name and author", async () => {
    mockCallApi.mockResolvedValue("");

    await fetchWork({ nameAndAuthor: { urlAuthor: "foo", urlName: "bar" } });
    await fetchWork({ nameAndAuthor: { urlAuthor: "foo", urlName: "bar" } });

    expect(mockCallApi).toHaveBeenCalledTimes(1);
  });

  it("returns different results on different calls", async () => {
    mockCallApi.mockResolvedValue("");

    await fetchWork({ id: "foo" });
    await fetchWork({ id: "bar" });

    expect(mockCallApi).toHaveBeenCalledTimes(2);
  });

  it("returns different results on id then url and name", async () => {
    mockCallApi.mockResolvedValue("");

    await fetchWork({ id: "foo" });
    await fetchWork({ nameAndAuthor: { urlAuthor: "foo", urlName: "bar" } });

    expect(mockCallApi).toHaveBeenCalledTimes(2);
  });

  it("retries on failed call", async () => {
    mockCallApi.mockRejectedValue("fail");

    const failed = fetchWork({ id: "foo" });
    await expect(failed).rejects.toBe("fail");
    try {
      await failed;
    } catch {}

    mockCallApi.mockResolvedValue("success");
    const succeeded = fetchWork({ id: "foo" });

    await expect(succeeded).resolves.toBe("success");
    expect(mockCallApi).toHaveBeenCalledTimes(2);
  });
});
