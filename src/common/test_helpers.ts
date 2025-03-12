import fs from "fs";

export function cleanupSqlTableFiles(name: string): void {
  try {
    fs.unlinkSync(name);
  } catch (e) {}
  try {
    fs.unlinkSync(`${name}-shm`);
  } catch (e) {}
  try {
    fs.unlinkSync(`${name}-wal`);
  } catch (e) {}
}

export function replaceEnvVar(key: string, value: string) {
  const original = process.env[key];
  beforeAll(() => {
    process.env[key] = value;
  });
  afterAll(() => {
    process.env[key] = original;
  });
}
