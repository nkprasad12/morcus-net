const FAKE_MORCEUS_DATA_ROOT = "src/morceus/testdata";

export function setupMorceusWithFakeData() {
  const ORIGINAL_MORCEUS_DATA_ROOT = process.env.MORCEUS_DATA_ROOT;

  beforeAll(() => {
    process.env.MORCEUS_DATA_ROOT = FAKE_MORCEUS_DATA_ROOT;
  });

  afterAll(() => {
    process.env.MORCEUS_DATA_ROOT = ORIGINAL_MORCEUS_DATA_ROOT;
  });
}
