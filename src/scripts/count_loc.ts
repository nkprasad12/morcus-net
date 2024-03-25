/* istanbul ignore file */

import { assertEqual } from "@/common/assert";
import fs from "fs";
import path from "path";

const ROOT = "src";
const SKIPS = ["src/libs", "__pycache__"];

async function* walk(dir: string): AsyncGenerator<string> {
  for (const skip of SKIPS) {
    if (dir.includes(skip)) {
      return;
    }
  }
  for await (const d of await fs.promises.opendir(dir)) {
    const entry = path.join(dir, d.name);
    if (d.isDirectory()) yield* walk(entry);
    else if (d.isFile() && !d.name.endsWith(".end") && !d.name.endsWith(".log"))
      yield entry;
  }
}

function sum(input: number[]): number {
  return input.reduce((total, current) => total + current, 0);
}

function formatCells(cells: string[][]): string {
  const n = cells[0].length;
  const maxLengths = cells[0].map((cell) => cell.length);
  for (const row of cells) {
    assertEqual(row.length, n);
    for (let i = 0; i < row.length; i++) {
      maxLengths[i] = Math.max(maxLengths[i], row[i].length);
    }
  }

  const paddedCells = cells.map((row) => row.slice());
  for (const row of paddedCells) {
    for (let i = 0; i < row.length; i++) {
      const pad = maxLengths[i] - row[i].length;
      row[i] += " ".repeat(pad);
    }
  }
  return paddedCells.map((row) => row.join(" | ")).join("\n");
}

async function countLines() {
  const tsSource: number[] = [];
  const tsTest: number[] = [];
  const pySource: number[] = [];
  const pyTest: number[] = [];
  for await (const file of walk(ROOT)) {
    const contents = await fs.promises.readFile(file);
    const lines = contents.toString().split("\n").length - 1;
    if (file.endsWith(".test.tsx") || file.endsWith(".test.ts")) {
      tsTest.push(lines);
    } else if (file.endsWith(".tsx") || file.endsWith(".ts")) {
      tsSource.push(lines);
    } else if (file.endsWith(".py")) {
      if (file.split("/").slice(-1)[0].startsWith("test_")) {
        pyTest.push(lines);
      } else {
        pySource.push(lines);
      }
    }
  }
  const total = [tsSource, tsTest, pySource, pyTest].flatMap((x) => x);
  const cells = [
    ["TypeScript source", `${sum(tsSource)} lines`, `${tsSource.length} files`],
    ["TypeScript tests", `${sum(tsTest)} lines`, `${tsTest.length} files`],
    ["Python source", `${sum(pySource)} lines`, `${pySource.length} files`],
    ["Python tests", `${sum(pyTest)} lines`, `${pyTest.length} files`],
    ["Total", `${sum(total)} lines`, `${total.length} files`],
  ];
  console.log(formatCells(cells));
}

countLines().catch(() => console.log("Error"));
