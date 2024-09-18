import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";

export function* filesInPaths(inputPaths: string[]): Generator<string> {
  const queue: string[] = [...inputPaths];
  while (queue.length > 0) {
    const current = queue.pop()!;
    if (fs.lstatSync(current).isFile()) {
      yield current;
      continue;
    }
    const dir = fs.readdirSync(current, { withFileTypes: true });
    for (const content of dir) {
      const entityPath = path.join(current, content.name);
      if (content.isFile()) {
        yield entityPath;
      }
      if (content.isDirectory()) {
        queue.push(entityPath);
      }
    }
  }
}

export async function createCleanDir(path: string) {
  await safeRmDir(path);
  await createDir(path);
}

export async function createDir(path: string) {
  await fsPromises.mkdir(path, { recursive: true });
}

export async function safeRmDir(path: string) {
  try {
    await fsPromises.rm(path, { recursive: true, force: true });
  } catch {}
}
