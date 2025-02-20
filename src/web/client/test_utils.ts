const SKIP_LIST: string[][] = [["Invalid DOM property", "spellcheck"]];

function matchesSkipPattern(args: any[], skipList: string[][]) {
  return skipList.some((skipList) =>
    skipList.every((pattern) =>
      args.some((arg) => typeof arg === "string" && arg.includes(pattern))
    )
  );
}

export function silenceErroneousWarnings(skipList?: string[][]) {
  const finalSkipList = SKIP_LIST.concat(skipList ?? []);
  const realConsoleError = console.error;
  const fakeConsoleError = jest.fn();
  console.error = fakeConsoleError;
  fakeConsoleError.mockImplementation((...args) => {
    if (matchesSkipPattern(args, finalSkipList)) {
      return;
    }
    realConsoleError(...args);
  });

  beforeAll(() => {
    console.error = fakeConsoleError;
  });

  afterAll(() => {
    console.error = realConsoleError;
  });
}
