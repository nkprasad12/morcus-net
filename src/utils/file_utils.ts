import fs from "fs";
import path from "path";

export function* filesInPaths(inputDirs: string[]): Generator<string> {
  const queue: string[] = [...inputDirs];
  while (queue.length > 0) {
    const currentDir = queue.pop()!;
    const dir = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const content of dir) {
      const entityPath = path.join(currentDir, content.name);
      if (content.isFile()) {
        yield entityPath;
      }
      if (content.isDirectory()) {
        queue.push(entityPath);
      }
    }
  }
}
