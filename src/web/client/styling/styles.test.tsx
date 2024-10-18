/**
 * @jest-environment jsdom
 */

import {
  DEFAULT_STYLE_CONFIG,
  StyleConfig,
} from "@/web/client/styling/style_context";
import {
  getBackgroundColor,
  getGlobalStyles,
} from "@/web/client/styling/styles";

const LIGHT_MODE: StyleConfig = { ...DEFAULT_STYLE_CONFIG, darkMode: false };
const DARK_MODE: StyleConfig = { ...DEFAULT_STYLE_CONFIG, darkMode: true };

function isDarker(first: string, second: string): boolean {
  return (
    first.substring(1, 3) < second.substring(1, 3) &&
    first.substring(3, 5) < second.substring(3, 5) &&
    first.substring(5, 7) < second.substring(5, 7)
  );
}

function expectDarker(first: string, second: string) {
  expect(isDarker(first, second)).toBe(true);
}

function expectDarkerInStyle(
  first: StyleConfig,
  second: StyleConfig,
  cssClass: string,
  property: string
) {
  const firstStyle = getGlobalStyles(first);
  const secondStyle = getGlobalStyles(second);
  // @ts-ignore
  expectDarker(firstStyle[cssClass][property], secondStyle[cssClass][property]);
}

describe("Custom styles", () => {
  test("get background color returns darker in dark mode", () => {
    expectDarker(getBackgroundColor(DARK_MODE), getBackgroundColor(LIGHT_MODE));
  });

  test("styles has a lighter text color in dark mode", () => {
    expectDarkerInStyle(LIGHT_MODE, DARK_MODE, ".contentText", "color");
  });
});
