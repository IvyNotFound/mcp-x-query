/**
 * GrokClient — Thin wrapper around the Grok API (x.ai)
 *
 * Grok exposes an OpenAI-compatible API endpoint, so we reuse the `openai`
 * npm package with a custom baseURL pointing to api.x.ai.
 *
 * The key capability used here is the `x_search` tool, which lets Grok search
 * Twitter/X in real time as part of the model's response generation.
 *
 * Structured output:
 *  Every call uses `text.format = { type: "json_schema", ... }` to force Grok
 *  to return a JSON object that matches the provided Zod schema. We convert the
 *  Zod schema to JSON Schema via `zod-to-json-schema` with `$refStrategy:"none"`
 *  so that no `$ref` / `$defs` nodes are emitted (Grok rejects those).
 */

import OpenAI from "openai";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ZodType } from "zod";
import { GrokAuthError, GrokRateLimitError } from "./errors.js";
import { CircuitBreaker } from "./circuit-breaker.js";
import { log } from "./logger.js";

/** Model identifier for the Grok variant used by this server. */
const MODEL = "grok-4-1-fast-non-reasoning";

/**
 * Allowed hostnames for media URLs passed to analyzeMedia.
 * Only official Twitter/X CDN domains are accepted to prevent SSRF-style
 * attacks where a crafted media URL could leak internal infrastructure details
 * or make the server fetch arbitrary external resources.
 */
const ALLOWED_MEDIA_DOMAINS = new Set([
  "pbs.twimg.com",
  "video.twimg.com",
  "ton.twimg.com",
]);

/**
 * Vision-capable model for image/video analysis.
 * Grok 2 Vision supports image_url content blocks via chat completions.
 */
const VISION_MODEL = "grok-2-vision-1212";

/**
 * Optional filters forwarded to the x_search tool.
 * All fields are optional — omit any that are not needed.
 */
export interface XSearchParams {
  /** Only return results from these Twitter handles. */
  allowed_x_handles?: string[];
  /** Exclude results from these Twitter handles. */
  excluded_x_handles?: string[];
  /** Return tweets posted on or after this date (YYYY-MM-DD). */
  from_date?: string;
  /** Return tweets posted on or before this date (YYYY-MM-DD). */
  to_date?: string;
  /** When true, Grok attempts to analyse video content in tweets. */
  enable_video_understanding?: boolean;
}

export class GrokClient {
  private openai: OpenAI;
  private readonly circuitBreaker = new CircuitBreaker();

  /**
   * @param apiKey  Your xAI API key (starts with "xai-").
   *                Set via XAI_API_KEY environment variable.
   */
  constructor(apiKey: string) {
    // Use the OpenAI client library with xAI's compatible endpoint.
    // maxRetries: 3 — the SDK retries 429 and 5xx automatically with backoff.
    // timeout: 60 s  — Grok x_search calls can be slow (real-time Twitter search).
    //   Without an explicit timeout the SDK default is 10 minutes, which is far
    //   too long for an interactive MCP tool.
    this.openai = new OpenAI({
      apiKey,
      baseURL: "https://api.x.ai/v1",
      maxRetries: 3,
      timeout: 60_000,
    });
  }

  /**
   * Converts OpenAI SDK API errors into typed Grok errors and re-throws.
   * Always throws — return type `never` ensures TypeScript treats call sites
   * as unreachable after this call (no spurious "possibly undefined" errors).
   */
  private rethrowApiError(err: unknown): never {
    if (
      err instanceof OpenAI.AuthenticationError ||
      err instanceof OpenAI.PermissionDeniedError
    ) {
      throw new GrokAuthError();
    }
    if (err instanceof OpenAI.RateLimitError) {
      // The SDK exhausted all retries — surface a user-friendly rate limit error.
      const retryAfter = err.headers?.get("retry-after");
      const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined;
      throw new GrokRateLimitError(retryAfterMs);
    }
    throw err;
  }

  /**
   * Send a natural-language prompt to Grok and receive a typed, validated result.
   *
   * @param prompt       The instruction sent to Grok (role: "user").
   * @param schema       Zod schema that describes the expected response shape.
   * @param schemaName   Human-readable name for the schema (used as the JSON Schema $id).
   * @param xSearchParams  Optional x_search filters (date range, handle allow/block lists…).
   * @returns            Parsed and cast value conforming to `schema`.
   *
   * Throws if:
   *  - Grok returns no text output.
   *  - The response text is not valid JSON (e.g. truncated due to token limits).
   */
  async query<T>(
    prompt: string,
    schema: ZodType<T>,
    schemaName: string,
    xSearchParams?: XSearchParams
  ): Promise<T> {
    // Convert the Zod schema to a flat JSON Schema object.
    // `$refStrategy:"none"` inlines all sub-schemas, preventing $ref / $defs
    // nodes that the Grok structured-output endpoint does not support.
    // Cast: zod-to-json-schema expects the Zod v3 ZodType signature; Zod v4
    // changed the generic parameters but the runtime behaviour is identical.
    const rawSchema = zodToJsonSchema(schema as unknown as Parameters<typeof zodToJsonSchema>[0], {
      name: schemaName,
      $refStrategy: "none",
      target: "jsonSchema7",
    });

    // When a `name` is provided, zodToJsonSchema wraps the output under
    // { definitions: { [name]: <actual schema> } }. Extract just the schema.
    const definitions = (rawSchema as Record<string, unknown>).definitions as
      | Record<string, unknown>
      | undefined;
    const flatSchema =
      definitions?.[schemaName] ?? rawSchema;

    // Build the x_search tool descriptor, merging in any caller-supplied filters.
    const tool: Record<string, unknown> = { type: "x_search" };
    if (xSearchParams) {
      Object.assign(tool, xSearchParams);
    }

    // Reject immediately if the circuit is open (too many recent 5xx failures).
    // Throws GrokCircuitOpenError without touching the API.
    this.circuitBreaker.check();

    let response: Awaited<ReturnType<typeof this.openai.responses.create>>;
    try {
      response = await this.openai.responses.create({
        model: MODEL,
        input: [{ role: "user", content: prompt }],
        tools: [tool as unknown as OpenAI.Responses.Tool],
        max_output_tokens: 16384, // Large enough for threads / bulk tweet arrays.
        text: {
          format: {
            type: "json_schema",
            name: schemaName,
            schema: flatSchema as Record<string, unknown>,
            // strict:false — some optional fields may be absent; Zod handles validation.
            strict: false,
          } as unknown as OpenAI.Responses.ResponseTextConfig["format"],
        },
      });
    } catch (err) {
      // Only count transient (5xx / network) failures against the circuit.
      // Auth (401/403) and rate-limit (429) errors are non-transient client
      // errors — tripping the circuit for them would mask the real cause.
      const isNonTransient =
        err instanceof OpenAI.AuthenticationError ||
        err instanceof OpenAI.PermissionDeniedError ||
        err instanceof OpenAI.RateLimitError;
      if (!isNonTransient) {
        this.circuitBreaker.onFailure();
      }
      this.rethrowApiError(err);
    }
    this.circuitBreaker.onSuccess();

    const text = response.output_text;
    if (!text) {
      throw new Error("Grok returned no text output.");
    }

    // Attempt to parse the JSON; if it fails the response was likely truncated.
    // Then validate against the Zod schema so structurally invalid responses
    // are caught here rather than silently corrupting downstream data.
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      const truncated = text.length > 200 ? text.slice(-200) : text;
      throw new Error(
        `Grok response JSON is malformed (likely truncated). Last 200 chars: ...${truncated}`
      );
    }
    return schema.parse(parsed);
  }

  /**
   * Analyse un média (image, vidéo, GIF) via le modèle vision de Grok.
   *
   * Pour les images et GIFs, l'URL est passée directement en image_url.
   * Pour les vidéos, on utilise thumbnail_url si disponible ; sinon l'URL directe.
   *
   * @param mediaUrl    URL publique du média à analyser.
   * @param mediaType   Type de média : "image" | "video" | "gif".
   * @param tweetText   Texte du tweet (contexte fourni au modèle pour un meilleur résumé).
   * @returns           Résumé textuel du contenu du média, ou chaîne vide si l'analyse échoue.
   */
  async analyzeMedia(
    mediaUrl: string,
    mediaType: "image" | "video" | "gif",
    tweetText?: string
  ): Promise<string> {
    if (!mediaUrl) return "";

    // Validate media URL against the allowed-domain whitelist before sending
    // to the vision model. Rejects malformed URLs and non-Twitter CDN domains.
    try {
      const { hostname } = new URL(mediaUrl);
      if (!ALLOWED_MEDIA_DOMAINS.has(hostname)) {
        log("warn", "analyzeMedia blocked: domain not in allowlist", { domain: hostname });
        return "";
      }
    } catch {
      log("warn", "analyzeMedia blocked: invalid URL", { url: mediaUrl });
      return "";
    }

    const contextLine = tweetText
      ? `This media comes from a tweet with the following text: "${tweetText}". `
      : "";

    const prompt =
      mediaType === "video"
        ? `${contextLine}Describe in detail what this video thumbnail shows (subject, context, important visual elements).`
        : `${contextLine}Describe in detail the content of this image (subject, visible text, context, important elements).`;

    try {
      const response = await this.openai.chat.completions.create(
        {
          model: VISION_MODEL,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: mediaUrl } },
              ],
            },
          ],
          max_tokens: 512,
        },
        // Vision analysis is faster than x_search — 30 s is plenty.
        { timeout: 30_000 }
      );

      return response.choices[0]?.message?.content?.trim() ?? "";
    } catch (err) {
      // Auth errors are fatal — rethrow so the caller surfaces them properly.
      if (
        err instanceof OpenAI.AuthenticationError ||
        err instanceof OpenAI.PermissionDeniedError
      ) {
        throw new GrokAuthError();
      }
      // All other failures are non-fatal: media analysis is optional.
      log("warn", "analyzeMedia failed", {
        url: mediaUrl,
        detail: err instanceof Error ? err.message : String(err),
      });
      return "";
    }
  }
}
