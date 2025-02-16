import { JSX } from "react";

export interface ContentPage {
  /** The content to display for this page. */
  Content: (props: Partial<Record<string, any>>) => JSX.Element;
  /** The paths to match for this content. */
  paths: PagePath[];
}

type PagePathTemplate = `/${string}`;

export class PagePath {
  static of(path: string): PagePath | null {
    if (!PagePath.isValid(path)) {
      return null;
    }
    return new PagePath(path);
  }

  static isValid(path: string): path is PagePathTemplate {
    const chunks = path.split("/");
    if (chunks[0] !== "") {
      return false;
    }
    for (const chunk of chunks.slice(1)) {
      if (!/^(?::)?[a-zA-Z0-9]+$/.test(chunk)) {
        return false;
      }
    }
    return true;
  }

  private constructor(readonly path: PagePathTemplate) {}

  /**
   * Parses parameters from an input path.
   *
   * @returns null if the input does not match this path, or
   * an object containing the path parameters if it does.
   */
  parseParams(urlPath: string): Record<string, string> | null {
    const result: Record<string, string> = {};
    const templateChunks = this.path.split("/").slice(1);
    const urlPathChunks = urlPath.split("/").slice(1);
    if (templateChunks.length !== urlPathChunks.length) {
      return null;
    }
    for (let i = 0; i < templateChunks.length; i++) {
      const templateChunk = templateChunks[i];
      if (templateChunk.startsWith(":")) {
        result[templateChunk.substring(1)] = urlPathChunks[i];
      } else if (templateChunk !== urlPathChunks[i]) {
        return null;
      }
    }
    return result;
  }

  matches(urlPath: string): boolean {
    return this.parseParams(urlPath) !== null;
  }

  /**
   * Along with the required parameters, transforms this into
   * the `path` component of a URL.
   *
   * @param rawParams the path parameters. All paramaters required
   * by this path should be provided (and only thos parameters).
   *
   * @requires null if the input params do not match what is
   * required from this path, or string of the path if it does.
   */
  toUrlPath(rawParams?: Record<string, string | undefined>): string | null {
    const params = rawParams || {};
    let result = "";
    for (const part of this.path.split("/").slice(1)) {
      if (!part.startsWith(":")) {
        result += `/${part}`;
        continue;
      }
      const key = part.substring(1);
      const value = params[key];
      delete params[key];
      if (value === undefined) {
        return null;
      }
      result += `/${value}`;
    }
    let unusedKeys = false;
    for (const [_, value] of Object.entries(params)) {
      unusedKeys = unusedKeys || value !== undefined;
    }
    return unusedKeys ? null : result;
  }
}

export function matchesPage(urlPath: string, page: ContentPage): boolean {
  for (const path of page.paths) {
    if (path.matches(urlPath)) {
      return true;
    }
  }
  return false;
}
