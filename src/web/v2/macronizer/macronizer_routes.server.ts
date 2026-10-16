import express, {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { asyncHandler } from "@/web/v2/core/server/async_handler.server";
import {
  applyChoices,
  resolveInitialResult,
} from "@/web/v2/macronizer/macronizer_apply.server";
import {
  MacronizerUnavailableError,
  createMacronizerEngine,
  type MacronizerEngine,
} from "@/web/v2/macronizer/macronizer_engine.server";
import {
  parseApplyBody,
  parseMacronizeBody,
  type MacronizeInputParseResult,
} from "@/web/v2/macronizer/macronizer_params.server";
import { MACRONIZER_MAX_CHARS } from "@/web/v2/macronizer/macronizer_slots.common";
import { isPartialRequest } from "@/web/v2/core/server/request_params.server";
import { requestTimer } from "@/web/v2/core/server/telemetry.server";
import {
  renderMacronizerPage,
  renderMacronizerPartial,
  type MacronizerPageOptions,
} from "@/web/v2/macronizer/macronizer_view.server";

export interface CreateMacronizerRoutesOptions {
  engine?: MacronizerEngine;
}

/**
 * The most form fields an Apply submission can legitimately carry. Each card
 * posts a hidden `mN`, one `mN` per checked vowel and at most one `wN` radio,
 * so a card for a word of `L` letters posts at most `L + 2` fields. Words need
 * a separator between them, so a word costs `L + 1` characters, and fields
 * per character peak at 1.5 for one-letter words (`a a a ...`). Add `text`,
 * `sug` and `shown`, plus headroom.
 */
export const MACRONIZER_PARAMETER_LIMIT =
  Math.ceil(MACRONIZER_MAX_CHARS * 1.5) + 100;

/** The raw form bodies, kept so error pages can still show the user's text. */
const rawFormBodies = new WeakMap<object, string>();

const urlencodedParser = express.urlencoded({
  extended: false,
  limit: "1mb",
  parameterLimit: MACRONIZER_PARAMETER_LIMIT,
  verify: (req, _res, buf) => {
    rawFormBodies.set(req, buf.toString("utf8"));
  },
});

const MAX_CHARS_LABEL = MACRONIZER_MAX_CHARS.toLocaleString("en-US");

function sendPageOrPartial(
  req: Request,
  res: Response,
  options: MacronizerPageOptions,
  status = 200
): void {
  res.status(status).type("html");
  // Fetch requests get the slot partial even for errors, so the client can
  // show the error in place instead of resubmitting the form natively.
  if (isPartialRequest(req, res)) {
    res.send(renderMacronizerPartial(options));
    return;
  }
  res.send(renderMacronizerPage(options));
}

function bodyParseErrorType(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) {
    return undefined;
  }
  if ("type" in err && typeof err.type === "string") {
    return err.type;
  }
  if ("status" in err && err.status === 413) {
    return "entity.too.large";
  }
  return undefined;
}

/** The submitted `text`, recovered from the raw body when parsing failed. */
function recoverInputText(req: Request): string {
  const raw = rawFormBodies.get(req);
  if (raw === undefined) {
    return "";
  }
  const parsed = parseMacronizeBody({
    text: new URLSearchParams(raw).get("text") ?? "",
  });
  return parsed.text.slice(0, MACRONIZER_MAX_CHARS);
}

function handleBodyParseError(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const type = bodyParseErrorType(err);
  if (type === "parameters.too.many") {
    sendPageOrPartial(req, res, {
      inputText: recoverInputText(req),
      errorBanner:
        "Too many choices to apply at once. Please macronize a shorter passage.",
    });
    return;
  }
  if (type === "entity.too.large") {
    // The body is only read up to the limit, so usually no text is recovered.
    sendPageOrPartial(req, res, {
      inputText: recoverInputText(req),
      errorBanner: `Input is too long. Please shorten your passage to ${MAX_CHARS_LABEL} characters or fewer.`,
    });
    return;
  }
  next(err);
}

/**
 * Responds to empty or too-long input. Returns whether it did, i.e. whether
 * the input was invalid.
 */
function respondToInvalidInput(
  req: Request,
  res: Response,
  parsed: MacronizeInputParseResult
): boolean {
  if (parsed.kind === "empty") {
    sendPageOrPartial(req, res, {
      inputText: "",
      errorBanner: "Please enter or paste a Latin passage to macronize.",
    });
    return true;
  }
  if (parsed.kind === "too_long") {
    sendPageOrPartial(req, res, {
      inputText: parsed.text.slice(0, MACRONIZER_MAX_CHARS),
      errorBanner: `Input is too long (${parsed.length.toLocaleString(
        "en-US"
      )} characters). Please shorten your passage to ${MAX_CHARS_LABEL} characters or fewer.`,
    });
    return true;
  }
  return false;
}

export function createMacronizerRoutes(
  options: CreateMacronizerRoutesOptions = {}
): Router {
  const router = Router();
  const engine = options.engine ?? createMacronizerEngine();
  const simulated = engine.simulated === true;

  router.get("/macronizer", (_req, res) => {
    res.status(200).type("html").send(renderMacronizerPage());
  });

  router.post(
    "/macronizer",
    urlencodedParser,
    handleBodyParseError,
    asyncHandler(async (req: Request, res: Response) => {
      const parsed = parseMacronizeBody(req.body);
      if (respondToInvalidInput(req, res, parsed)) {
        return;
      }

      try {
        const rawResult = await engine.macronize(parsed.text);
        requestTimer(res).mark("lookupComplete");
        const document = resolveInitialResult(rawResult);
        sendPageOrPartial(req, res, {
          inputText: parsed.text,
          document,
          simulated,
        });
      } catch (err) {
        const isUnavailable = err instanceof MacronizerUnavailableError;
        if (!isUnavailable) {
          console.error("Macronize failed:", err);
        }
        sendPageOrPartial(
          req,
          res,
          {
            inputText: parsed.text,
            errorBanner: isUnavailable
              ? "The macronizer is unavailable because the morphological tagger service is not configured."
              : "The macronizer is temporarily unavailable. Please try again in a moment.",
          },
          503
        );
      }
    })
  );

  router.post(
    "/macronizer/apply",
    urlencodedParser,
    handleBodyParseError,
    asyncHandler(async (req: Request, res: Response) => {
      const parsed = parseApplyBody(req.body);
      if (respondToInvalidInput(req, res, parsed.parseResult)) {
        return;
      }
      const text = parsed.parseResult.text;

      try {
        const unsuggested = await engine.analyzeOnly(text);
        requestTimer(res).mark("lookupComplete");
        const document = applyChoices(unsuggested, {
          suggestions: parsed.suggestions,
          priorShown: parsed.priorShown,
          wordChoices: parsed.wordChoices,
          vowelSubmissions: parsed.vowelSubmissions,
        });
        sendPageOrPartial(req, res, {
          inputText: text,
          document,
          simulated,
        });
      } catch (err) {
        // Apply has no external dependency, so this is a bug.
        console.error("Macronizer Apply failed:", err);
        sendPageOrPartial(
          req,
          res,
          {
            inputText: text,
            errorBanner:
              "The macronizer is temporarily unavailable. Please try again in a moment.",
          },
          503
        );
      }
    })
  );

  return router;
}
