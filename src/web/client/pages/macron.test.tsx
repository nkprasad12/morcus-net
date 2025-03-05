/**
 * @jest-environment jsdom
 */

import { describe, expect, test } from "@jest/globals";
import { render, screen, waitFor } from "@testing-library/react";
import user from "@testing-library/user-event";

import { Macronizer } from "@/web/client/pages/macron";
import { callApi, callApiFull } from "@/web/utils/rpc/client_rpc";
import { silenceErroneousWarnings } from "@/web/client/test_utils";
import { DictsFusedApi, type MacronizedResult } from "@/web/api_routes";

console.debug = jest.fn();

jest.mock("@/web/utils/rpc/client_rpc");
jest.mock("@/web/client/utils/media_query", () => {
  return {
    ...jest.requireActual("@/web/client/utils/media_query"),
    useMediaQuery: jest.fn(),
  };
});

window.HTMLElement.prototype.scrollIntoView = jest.fn();
silenceErroneousWarnings();

const findOnScreen = (text: string) => {
  // Passing function to `getByText`
  return screen.getByText((_, element) => {
    const hasText = (element: Element | null) => element?.textContent === text;
    const elementHasText = hasText(element);
    const childrenDontHaveText = Array.from(element?.children || []).every(
      (child) => !hasText(child)
    );
    return elementHasText && childrenDontHaveText;
  });
};

const SAMPLE_OUTPUT: MacronizedResult = [
  {
    word: "divisa",
    options: [
      {
        form: "dīvīsa",
        options: [
          {
            lemma: "divido",
            morph: [
              "perf part pass fem nom/voc sg",
              "perf part pass neut nom/voc/acc pl",
            ],
          },
        ],
      },
      {
        form: "dīvīsā",
        options: [{ lemma: "divido", morph: ["perf part pass fem abl sg"] }],
      },
    ],
  },
  " ",
  {
    word: "in",
    options: [{ form: "in", options: [{ lemma: "in", morph: [""] }] }],
  },
  " ",
  {
    word: "partes",
    options: [
      {
        form: "partēs",
        options: [{ lemma: "pars", morph: ["fem nom/voc pl", "fem acc pl"] }],
      },
    ],
  },
  " ",
  {
    word: "tres",
    options: [
      {
        form: "trēs",
        options: [
          { lemma: "tres", morph: ["masc/fem acc pl", "masc/fem nom pl"] },
        ],
      },
    ],
  },
];

// @ts-expect-error
const mockCallApi: jest.Mock<any, any, any> = callApi;
// @ts-expect-error
const mockCallApiFull: jest.Mock<any, any, any> = callApiFull;

afterEach(() => {
  mockCallApi.mockReset();
  mockCallApiFull.mockReset();
});

describe("Macronizer View", () => {
  test("shows expected components", () => {
    render(<Macronizer />);

    expect(screen.getByRole("textbox")).toBeDefined();
    expect(screen.getByRole("button")).toBeDefined();
  });

  test("does not call server on empty submit", async () => {
    render(<Macronizer />);
    const submit = screen.getByRole("button");

    await user.click(submit);

    expect(mockCallApi).not.toHaveBeenCalled();
  });

  test("calls server on submit", async () => {
    render(<Macronizer />);
    const inputBox = screen.getByRole("textbox");
    const submit = screen.getByRole("button");

    await user.type(inputBox, "Gallia est omnis");
    await user.click(submit);

    expect(mockCallApi).toHaveBeenCalledTimes(1);
  });

  test("calls shows error on failure", async () => {
    mockCallApi.mockRejectedValue(new Error());
    render(<Macronizer />);
    const inputBox = screen.getByRole("textbox");
    const submit = screen.getByRole("button");

    await user.type(inputBox, "Gallia est omnis");
    await user.click(submit);

    await waitFor(() => {
      expect(screen.getByText("Error: please try again later.")).toBeDefined();
    });
  });

  test("handles happy path correctly.", async () => {
    mockCallApi.mockReturnValue(Promise.resolve(SAMPLE_OUTPUT));

    render(<Macronizer />);
    const inputBox = screen.getByRole("textbox");
    const submit = screen.getByRole("button");

    // Input doesn't matter as we are mocking the output.
    await user.type(inputBox, "whatever");
    await user.click(submit);

    await waitFor(() => {
      expect(findOnScreen("dīvīsa in partēs trēs")).not.toBeNull();
    });

    await user.click(screen.getByText("dīvīsa"));
    expect(screen.getAllByText("divido")).not.toHaveLength(0);

    mockCallApiFull.mockResolvedValue({});
    await user.click(screen.getAllByText("divido")[0]);
    expect(mockCallApiFull).toHaveBeenCalledWith(
      DictsFusedApi,
      expect.objectContaining({ query: "divido" })
    );
  });
});
