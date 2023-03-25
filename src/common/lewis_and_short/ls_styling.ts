export function abbreviationText(
  original: string,
  lookup: Map<string, string>
): string {
  const expanded = lookup.get(original)!;
  return attachHoverText(expanded, `Expanded from: ${original}`);
}

// Edge cases to watch out for:
// We can have two separate abbreviated forms next to each other,
// for example `Am. prol. 33` has:
// `Am.` -> `Amphitruo`
// `prol.` -> Prologue
//
// And also we can have multi-word keys like `de Or.` where we need to
// make sure we are handling `de` as connected to `Or.`.

// function attachAbbreviations(
//   message: string,
//   lookup: Map<string, string>
// ): string {
//   const words = message.split(" ");
//   const abbrevIdxs: number[] = [];
//   words.forEach((word, i) => {
//     if (word.slice(-1) === ".") {
//       abbrevIdxs.push(i);
//     }
//   });
//   if (abbrevIdxs.length === 0) {
//     return message;
//   }
//   abbrevIdxs.push(-1);

//   // A run a series of continuous abbreviation tokens.
//   // The first element is the start index, the second is the length.
//   const runs: [number, number][] = [];
//   let currentRun: [number, number] = [abbrevIdxs[0], 1];
//   for (const i of abbrevIdxs.slice(1)) {
//     const [currentRunStart, currentRunLength] = currentRun;
//     if (i - currentRunStart === currentRunLength) {
//       currentRun = [currentRunStart, currentRunLength + 1];
//     } else {
//       runs.push(currentRun);
//       currentRun = [i, 1];
//     }
//   }

//   const expansions = runs.forEach(([startIdx, length]) => {
//     for (let l = length; l > 0; l--) {
//       for (let i = 0; i <= length - l; i++) {

//       }
//     }
//   });
// }

export function attachHoverText(
  displayText: string,
  hoverText: string
): string {
  const style = `style="display: inline; border-bottom: 1px dashed blue;"`;
  return `<div ${style} title="${hoverText}">${displayText}</div>`;
}
