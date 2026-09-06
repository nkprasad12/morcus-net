const { execSync } = require('child_process');

const html = `
<!DOCTYPE html>
<html>
<head>
<style>
.container {
  width: 800px;
}
.v2-segmented-bar {
  display: grid;
  grid-template-columns: auto auto 1fr;
  align-items: start;
  gap: 8px;
  width: 100%;
}
.v2-tool-pane {
  display: contents;
}
.v2-tab-pill {
  grid-row: 1;
  display: inline-flex;
  padding: 6px 14px;
}
.v2-tool-body {
  grid-row: 2;
  grid-column: 1 / -1;
  width: 100%;
}
</style>
</head>
<body>
<div class="container">
  <div class="v2-segmented-bar">
    <details class="v2-tool-pane" id="d1" open>
      <summary class="v2-tab-pill" id="s1">Outline (39)</summary>
      <div class="v2-tool-body" id="b1">Outline Body Content that is quite wide or long</div>
    </details>
    <details class="v2-tool-pane" id="d2">
      <summary class="v2-tab-pill" id="s2">Inflections (1)</summary>
      <div class="v2-tool-body" id="b2">Inflections Body</div>
    </details>
  </div>
</div>
</body>
</html>
`;

// Let's run a node script using puppeteer or chrome with CDP to evaluate script and print rects!
