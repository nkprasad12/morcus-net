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
  const tsClientSource: number[] = [];
  const tsClientTest: number[] = [];
  const morceusSource: number[] = [];
  const morceusTest: number[] = [];
  const pySource: number[] = [];
  const pyTest: number[] = [];
  for await (const file of walk(ROOT)) {
    const contents = await fs.promises.readFile(file);
    const lines = contents.toString().split("\n").length - 1;
    const isClient = file.startsWith("src/web/client");
    const isMorceus = file.startsWith("src/morceus");
    if (file.endsWith(".test.tsx") || file.endsWith(".test.ts")) {
      tsTest.push(lines);
      if (isClient) tsClientTest.push(lines);
      if (isMorceus) morceusTest.push(lines);
    } else if (file.endsWith(".tsx") || file.endsWith(".ts")) {
      tsSource.push(lines);
      if (isClient) tsClientSource.push(lines);
      if (isMorceus) morceusSource.push(lines);
    } else if (file.endsWith(".py")) {
      if (file.split("/").slice(-1)[0].startsWith("test_")) {
        pyTest.push(lines);
      } else {
        pySource.push(lines);
      }
    }
  }
  const total = [tsSource, tsTest, pySource, pyTest].flatMap((x) => x);
  const row = (label: string, lineData: number[]) => {
    return [label, `${sum(lineData)} lines`, `${lineData.length} files`];
  };
  const cells = [
    row("TypeScript source", tsSource),
    row(" - client source", tsClientSource),
    row(" - Morceus source", morceusSource),
    row("TypeScript tests", tsTest),
    row(" - client tests", tsClientTest),
    row(" - Morceus tests", morceusTest),
    row("Python source", pySource),
    row("Python tests", pyTest),
    row("Total", total),
  ];
  console.log(formatCells(cells));
}

countLines().catch(() => console.log("Error"));
