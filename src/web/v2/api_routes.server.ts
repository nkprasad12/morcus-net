import { Router } from "express";
import { FusedDictionary } from "@/common/dictionaries/fused_dictionary";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import {
  resolveActiveDicts,
  resolveDictParams,
  dictParamsFromQuery,
} from "@/web/v2/dict/dict.server";
import {
  readLimit,
  toStringOrArray,
} from "@/web/v2/core/server/request_params.server";
import {
  getV2Completions,
  getV2DictChunks,
  cleanCompletionQuery,
} from "@/web/v2/dict/search/dict_completions.server";
import type { ReportApiRequest } from "@/web/utils/github";
import { GitHub } from "@/web/utils/github";
import { createAsyncRegistrars } from "@/web/v2/core/server/async_handler.server";
import {
  getCommitId,
  setVersionedCacheControl,
} from "@/web/v2/core/server/build_version.server";
import { requestTimer } from "@/web/v2/core/server/telemetry.server";

const ALL_LATIN_DICTS = LatinDict.AVAILABLE.map((d) => d.key);

export interface ApiRoutesOptions {
  reportHandler?: (request: ReportApiRequest) => Promise<void>;
  githubToken?: string;
}

export function createApiRoutes(
  fusedDict: FusedDictionary,
  options?: ApiRoutesOptions
): Router {
  const router = Router();
  const { getAsync, postAsync } = createAsyncRegistrars(router);

  // Autocomplete endpoint for live search suggestions
  getAsync("/api/completions", async (req, res) => {
    const rawPrefix =
      typeof req.query.prefix === "string" ? req.query.prefix : "";
    const rawQuery = typeof req.query.q === "string" ? req.query.q : "";
    const effectiveQuery = rawPrefix || rawQuery;
    const { query, isSuffix } = cleanCompletionQuery(effectiveQuery);

    const keysFromQuery = resolveDictParams(dictParamsFromQuery(req));
    const langParam = toStringOrArray(req.query.lang);
    const limit = readLimit(req);

    // Suffix searches (-arum, -ibus): dynamic clustered completions. These may
    // fall back to the dictionary cookie, so they are never versioned.
    if (isSuffix) {
      const { dictKeys } = resolveActiveDicts({
        keysFromQuery,
        cookieHeader: req.headers.cookie,
        lang: langParam,
      });
      const activeDicts = dictKeys.length > 0 ? dictKeys : ALL_LATIN_DICTS;
      try {
        const items = await getV2Completions(fusedDict, {
          rawQuery: query,
          activeDictKeys: activeDicts,
          limit,
        });
        res.json(items);
      } catch (err) {
        console.error("Error in suffix completions:", err);
        requestTimer(res).mark("error");
        res.json([]);
      }
      return;
    }

    // Prefix searches: a dictionary-keyed chunk. The client fetches it with
    // `?v=`, so it is cached `public` for the rest of the build. That is only
    // safe because it depends on nothing but the URL: no cookies here. Without
    // `d`/`dict`, the chunk covers every dictionary.
    let chunkDicts: string[] | undefined = undefined;
    if (keysFromQuery !== null) {
      const { dictKeys } = resolveActiveDicts({
        keysFromQuery,
        lang: langParam,
      });
      chunkDicts = dictKeys.length > 0 ? dictKeys : ALL_LATIN_DICTS;
    }
    try {
      const chunks = await getV2DictChunks(fusedDict, {
        rawPrefix: query,
        activeDictKeys: chunkDicts,
      });
      setVersionedCacheControl(req, res);
      res.json(chunks);
    } catch (err) {
      console.error("Error in completions chunk:", err);
      requestTimer(res).mark("error");
      res.json({});
    }
  });

  // Issue and feedback reporting endpoint
  postAsync("/api/report", async (req, res) => {
    const body: unknown = req.body;
    const isObj = typeof body === "object" && body !== null;
    const reportText =
      isObj && "reportText" in body && typeof body.reportText === "string"
        ? body.reportText.trim()
        : "";

    const editedRaw =
      isObj &&
      "editedText" in body &&
      typeof body.editedText === "object" &&
      body.editedText !== null
        ? body.editedText
        : undefined;

    const editedText =
      editedRaw &&
      "original" in editedRaw &&
      "edited" in editedRaw &&
      "sectionId" in editedRaw &&
      typeof editedRaw.original === "string" &&
      typeof editedRaw.edited === "string" &&
      typeof editedRaw.sectionId === "string" &&
      editedRaw.original.trim() !== "" &&
      editedRaw.edited.trim() !== "" &&
      editedRaw.sectionId.trim() !== ""
        ? {
            original: editedRaw.original,
            edited: editedRaw.edited,
            sectionId: editedRaw.sectionId.trim(),
          }
        : undefined;

    if (!reportText && !editedText) {
      res
        .status(400)
        .json({ error: "Either reportText or editedText is required" });
      return;
    }

    const tags =
      isObj && "tags" in body && Array.isArray(body.tags)
        ? body.tags.filter((t): t is string => typeof t === "string")
        : undefined;

    const reportRequest: ReportApiRequest = {
      reportText: reportText || undefined,
      editedText,
      tags,
      commit: getCommitId() ?? "undefined",
      url:
        isObj && "url" in body && typeof body.url === "string"
          ? body.url
          : undefined,
      userAgent: req.headers["user-agent"],
    };

    try {
      if (options?.reportHandler) {
        await options.reportHandler(reportRequest);
      } else {
        const token = options?.githubToken ?? process.env.GITHUB_TOKEN;
        if (token) {
          await GitHub.reportIssue(reportRequest, token);
        } else {
          console.log(GitHub.createIssueBody(reportRequest));
        }
      }
      res.json({ success: true });
    } catch (err) {
      console.error("Error submitting report:", err);
      res.status(500).json({ error: "Failed to submit report" });
    }
  });

  return router;
}
