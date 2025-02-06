import bodyParser from "body-parser";
import express from "express";
import http from "http";
import {
  PreStringifiedRpc,
  RouteDefinition,
  addApi,
} from "@/web/utils/rpc/server_rpc";
import { TelemetryLogger } from "@/web/telemetry/telemetry";
import {
  Serialization,
  Validator,
  instanceOf,
  isArray,
  isBoolean,
  isNumber,
  isString,
  stringifyMessage,
} from "@/web/utils/rpc/parsing";
import { callApi } from "@/web/utils/rpc/client_rpc";

const PORT = 1594;

// @ts-expect-error
global.location = {
  origin: `http://localhost:${PORT}`,
};
console.debug = jest.fn();

interface TestType {
  nested: { str: string };
  arr: string[];
}

class StringWrapper {
  constructor(readonly prop: string) {}

  static SERIALIZATION: Serialization<StringWrapper> = {
    name: "StringWrapper",
    validator: (t): t is StringWrapper => t instanceof StringWrapper,
    serialize: (t) => t.prop,
    deserialize: (t) => new StringWrapper(t),
  };

  double(): StringWrapper {
    return new StringWrapper(`${this.prop}${this.prop}`);
  }
}

type AttrValidator<T> = [string, Validator<T>];

function isObject(t: unknown, attrValidators: AttrValidator<any>[]): boolean {
  if (typeof t !== "object") {
    return false;
  }
  if (t === null) {
    return false;
  }
  for (const a of attrValidators) {
    // @ts-ignore
    if (!a[1](t[a[0]])) {
      return false;
    }
  }
  return true;
}

function isTestType(x: unknown): x is TestType {
  return isObject(x, [
    ["nested", (t): t is { str: string } => isObject(t, [["str", isString]])],
    ["arr", isArray(isString)],
  ]);
}

function appBundle() {
  const app = express();
  app.use(bodyParser.text());
  const telemetryLogger: TelemetryLogger = {
    logApiCall: () => Promise.resolve(),
    teardown: () => Promise.resolve(),
    logServerHealth: () => Promise.resolve(),
    logClientEvent: () => Promise.resolve(),
  };
  return { webApp: app, telemetry: Promise.resolve(telemetryLogger) };
}

// Routes and Handlers

const StringPost: RouteDefinition<string, string> = {
  route: {
    path: "/StringToStringPost",
    method: "POST",
    inputValidator: isString,
    outputValidator: isString,
  },
  handler: async (s) => s + " StringToStringPost",
};

const StringGet: RouteDefinition<string, string> = {
  route: {
    path: "/StringToStringGet",
    method: "GET",
    inputValidator: isString,
    outputValidator: isString,
  },
  handler: async (s) => s + " StringToStringGet",
};

const NumberPost: RouteDefinition<number, number> = {
  route: {
    path: "/NumberPost",
    method: "POST",
    inputValidator: isNumber,
    outputValidator: isNumber,
  },
  handler: async (x) => x * 4,
};

const NumberGet: RouteDefinition<number, number> = {
  route: {
    path: "/NumberGet",
    method: "GET",
    inputValidator: isNumber,
    outputValidator: isNumber,
  },
  handler: async (x) => x * 3,
};

const BoolGet: RouteDefinition<boolean, boolean> = {
  route: {
    path: "/BoolGet",
    method: "GET",
    inputValidator: isBoolean,
    outputValidator: isBoolean,
  },
  handler: async (x) => x,
};

const BoolPost: RouteDefinition<boolean, boolean> = {
  route: {
    path: "/BoolPost",
    method: "POST",
    inputValidator: isBoolean,
    outputValidator: isBoolean,
  },
  handler: async (x) => !x,
};

const JsonGet: RouteDefinition<TestType, TestType> = {
  route: {
    path: "/JsonGet",
    method: "GET",
    inputValidator: isTestType,
    outputValidator: isTestType,
  },
  handler: async (x) => ({
    nested: { str: x.nested.str + " JsonGet" },
    arr: x.arr.concat(["JsonGet"]),
  }),
};

const JsonGetPreStringified: RouteDefinition<
  TestType,
  TestType,
  PreStringifiedRpc
> = {
  route: {
    path: "/JsonGetPreStringified",
    method: "GET",
    inputValidator: isTestType,
    outputValidator: isTestType,
  },
  handler: async (x) =>
    stringifyMessage({
      nested: { str: x.nested.str + " JsonGetPreStringified" },
      arr: x.arr.concat(["JsonGetPreStringified"]),
    }),
  preStringified: true,
};

const JsonPost: RouteDefinition<TestType, TestType> = {
  route: {
    path: "/JsonPost",
    method: "POST",
    inputValidator: isTestType,
    outputValidator: isTestType,
  },
  handler: async (x) => ({
    nested: { str: x.nested.str + " JsonPost" },
    arr: x.arr.concat(["JsonPost"]),
  }),
};

const ThrowingHandler: RouteDefinition<string, string> = {
  route: {
    path: "/ThrowingHandler",
    method: "GET",
    inputValidator: isString,
    outputValidator: isString,
  },
  handler: (s) => Promise.reject("s"),
};

const OutputValidationThrows: RouteDefinition<string, string> = {
  route: {
    path: "/OutputValidationThrows",
    method: "GET",
    inputValidator: isString,
    outputValidator: (x): x is string => {
      throw new Error();
    },
  },
  handler: async (s) => s,
};

const ErroringHandler: RouteDefinition<string, string> = {
  route: {
    path: "/ErroringHandler",
    method: "GET",
    inputValidator: isString,
    outputValidator: isString,
  },
  handler: (s) => Promise.reject({ message: "Failed for test", status: 404 }),
};

const InputValidationError: RouteDefinition<string, string> = {
  route: {
    path: "/InputValidationError",
    method: "GET",
    inputValidator: (x): x is string => {
      throw new Error();
    },
    outputValidator: isString,
  },
  handler: async (s) => s,
};

const ClassObjectRoute: RouteDefinition<StringWrapper, StringWrapper> = {
  route: {
    path: "/ClassObjectRoute",
    method: "GET",
    inputValidator: instanceOf(StringWrapper),
    outputValidator: instanceOf(StringWrapper),
    registry: [StringWrapper.SERIALIZATION],
  },
  handler: async (sw) => sw.double(),
};

const ClassObjectRoutePreStringified: RouteDefinition<
  StringWrapper,
  StringWrapper,
  PreStringifiedRpc
> = {
  route: {
    path: "/ClassObjectRoutePreStringified",
    method: "GET",
    inputValidator: instanceOf(StringWrapper),
    outputValidator: instanceOf(StringWrapper),
    registry: [StringWrapper.SERIALIZATION],
  },
  handler: async (sw) =>
    stringifyMessage(sw.double(), [StringWrapper.SERIALIZATION]),
  preStringified: true,
};

const handlers: RouteDefinition<any, any, any>[] = [
  StringGet,
  StringPost,
  NumberGet,
  NumberPost,
  BoolGet,
  BoolPost,
  JsonGet,
  JsonGetPreStringified,
  JsonPost,
  ThrowingHandler,
  OutputValidationThrows,
  ErroringHandler,
  InputValidationError,
  ClassObjectRoute,
  ClassObjectRoutePreStringified,
];

function setupApp(): Promise<http.Server> {
  return new Promise((resolve) => {
    const bundle = appBundle();
    bundle.webApp.use(bodyParser.text());
    const server = http.createServer(bundle.webApp);
    handlers.forEach((h) => addApi(bundle, h));
    server.listen(PORT, () => {
      resolve(server);
    });
  });
}

describe("RPC library", () => {
  let server: http.Server | undefined = undefined;

  test("handles strings with GET", async () => {
    server = await setupApp();
    const result = await callApi(StringGet.route, "foo");
    expect(result).toBe("foo StringToStringGet");
  });

  test("handles strings with GET and special characters", async () => {
    server = await setupApp();
    const result = await callApi(StringGet.route, "foo?bar");
    expect(result).toBe("foo?bar StringToStringGet");
  });

  test("handles strings with POST", async () => {
    server = await setupApp();
    const result = await callApi(StringPost.route, "foo");
    expect(result).toBe("foo StringToStringPost");
  });

  test("handles numbers with GET", async () => {
    server = await setupApp();
    const result = await callApi(NumberGet.route, 57);
    expect(result).toBe(171);
  });

  test("handles numbers with POST", async () => {
    server = await setupApp();
    const result = await callApi(NumberPost.route, 57);
    expect(result).toBe(228);
  });

  test.each([true, false])("handles boolean with GET %s", async (value) => {
    server = await setupApp();
    expect(await callApi(BoolGet.route, value)).toBe(value);
  });

  test.each([true, false])("handles boolean with POST %s", async (value) => {
    server = await setupApp();
    expect(await callApi(BoolPost.route, value)).toBe(!value);
  });

  test("handles JSON with GET", async () => {
    server = await setupApp();
    const input = { nested: { str: "foo" }, arr: ["foo"] };

    const result = await callApi(JsonGet.route, input);

    expect(result).toStrictEqual({
      nested: { str: "foo JsonGet" },
      arr: ["foo", "JsonGet"],
    });
  });

  test("handles pre-serialized JSON with GET", async () => {
    server = await setupApp();
    const input = { nested: { str: "foo" }, arr: ["foo"] };

    const result = await callApi(JsonGetPreStringified.route, input);

    expect(result).toStrictEqual({
      nested: { str: "foo JsonGetPreStringified" },
      arr: ["foo", "JsonGetPreStringified"],
    });
  });

  test("handles JSON with POST", async () => {
    server = await setupApp();
    const input = { nested: { str: "foo" }, arr: ["foo"] };

    const result = await callApi(JsonPost.route, input);

    expect(result).toStrictEqual({
      nested: { str: "foo JsonPost" },
      arr: ["foo", "JsonPost"],
    });
  });

  test("handles server side error", async () => {
    server = await setupApp();
    const result = callApi(ThrowingHandler.route, "foo");
    await expect(result).rejects.toMatchObject({
      message: expect.stringMatching("500"),
    });
  });

  test("handles output validation throwing", async () => {
    server = await setupApp();
    const result = callApi(OutputValidationThrows.route, "foo");
    await expect(result).rejects.toMatchObject({
      message: expect.stringMatching("Unable to decode"),
    });
  });

  test("handler with server error status propagates error", async () => {
    server = await setupApp();
    const result = callApi(ErroringHandler.route, "foo");
    await expect(result).rejects.toMatchObject({
      message: expect.stringMatching("404"),
    });
  });

  test("handles input validation throwing", async () => {
    server = await setupApp();
    const result = callApi(InputValidationError.route, "foo");
    await expect(result).rejects.toMatchObject({
      message: expect.stringMatching("400"),
    });
  });

  test("addApi on unsupported type raises", () => {
    const bundle = appBundle();
    const Connect: RouteDefinition<string, string> = {
      route: {
        path: "/Connect",
        // @ts-ignore
        method: "CONNECT",
        inputValidator: isString,
        outputValidator: isString,
      },
      handler: async (s) => s,
    };

    expect(() => addApi(bundle, Connect)).toThrow();
  });

  test("handles data with serialization registry", async () => {
    server = await setupApp();
    const result = callApi(ClassObjectRoute.route, new StringWrapper("foo"));
    await expect(result).resolves.toStrictEqual<StringWrapper>(
      new StringWrapper("foofoo")
    );
  });

  test("handles pre-serialized data with serialization registry", async () => {
    server = await setupApp();
    const result = callApi(
      ClassObjectRoutePreStringified.route,
      new StringWrapper("foo")
    );
    await expect(result).resolves.toStrictEqual<StringWrapper>(
      new StringWrapper("foofoo")
    );
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      if (server === undefined) {
        resolve();
        return;
      }
      server.close(() => {
        resolve();
      });
    });
  });
});
