// import { SinglePageApp } from "@/web/client/components/single_page_app";

type PagePathTemplate = `/${string}`;
export interface PagePath {
  path: PagePathTemplate;
}

export namespace PagePath {
  export function isValid(path: string): path is PagePathTemplate {
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

  export function of(path: string): PagePath | null {
    if (!isValid(path)) {
      return null;
    }
    return { path };
  }

  export function parseParams(
    template: PagePath,
    urlPath: string
  ): Record<string, string> | null {
    const result: Record<string, string> = {};
    const templateChunks = template.path.split("/").slice(1);
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

  export function toUrlPath(
    pagePath: PagePath,
    rawParams?: Record<string, string | undefined>
  ): string | null {
    const params = rawParams || {};
    let result = "";
    for (const part of pagePath.path.split("/").slice(1)) {
      const nextPart = part.startsWith(":") ? params[part.substring(1)] : part;
      if (nextPart === undefined) {
        return null;
      }
      result += `/${nextPart}`;
    }
    return result;
  }
}

// function matchesPage(path: string, page: SinglePageApp.Page): boolean {
//   if (path === page.path) {
//     return true;
//   }
//   const pathParts = path.split("/").slice(1);
//   for (const subpage of page.subpages || []) {
//     const subpageParts = subpage.split("/").slice(1);
//     if (pathParts.length !== subpageParts.length) {
//       return false;
//     }
//     for (let i = 0; i < pathParts.length; i++) {
//       if (subpageParts[i][0] === ":") {
//         continue;
//       }
//       if (subpageParts[i] !== pathParts[i]) {
//         return false;
//       }
//     }
//   }
//   return false;
// }