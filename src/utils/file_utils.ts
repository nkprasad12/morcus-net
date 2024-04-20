import fs from "fs";
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
