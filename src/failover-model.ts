import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamResult,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

/**
 * List of free OpenRouter models to try in order.
 * The first model is the primary; if it fails, errors, or times out,
 * the next model is tried automatically.
 */
const FREE_MODELS = [
  'openai/gpt-oss-20b:free',
  'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'nvidia/nemotron-3-nano-30b-a3b:free',
  'nvidia/nemotron-nano-12b-v2-vl:free',
  'nvidia/nemotron-nano-9b-v2:free',
  'inclusionai/ling-3.0-flash:free',
  'poolside/laguna-s-2.1:free',
  'poolside/laguna-xs-2.1:free',
  'cohere/north-mini-code:free',
] as const;

/**
 * Default timeout for a model call before switching to the next model (ms).
 * Free models can be slow, so we give them a generous window.
 */
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Creates a failover language model that automatically switches to the next
 * available free OpenRouter model when the current one fails, errors, or
 * times out (idle).
 *
 * @param apiKey - OpenRouter API key
 * @param preferredModel - Optional preferred model ID (from OPENROUTER_MODEL)
 * @param timeoutMs - Optional timeout in ms before switching models
 */
export function createFailoverModel(
  apiKey: string | undefined,
  preferredModel?: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): LanguageModelV4 {
  // Build the ordered model list: preferred first, then the free fallback list
  const modelIds = [
    ...(preferredModel ? [preferredModel] : []),
    ...FREE_MODELS.filter((m) => m !== preferredModel),
  ];

  // Create a provider instance for each model (they share the same base URL)
  const provider = createOpenAICompatible({
    name: 'openrouter',
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey,
    includeUsage: true,
  });

  // Create model instances
  const models: LanguageModelV4[] = modelIds.map((id) =>
    provider(id) as LanguageModelV4,
  );

  // Track the current model index
  let currentIndex = 0;

  /**
   * Get the current model, advancing to the next one if needed.
   */
  function getCurrentModel(): LanguageModelV4 {
    return models[currentIndex % models.length];
  }

  /**
   * Advance to the next model and log the switch.
   */
  function switchToNextModel(reason: string): LanguageModelV4 {
    const previous = models[currentIndex % models.length];
    currentIndex = (currentIndex + 1) % models.length;
    const next = models[currentIndex % models.length];

    console.log(
      `\n  ⚠️  Model failover: "${previous.modelId}" ${reason}. ` +
        `Switching to "${next.modelId}".`,
    );

    return next;
  }

  /**
   * Check if an error is a timeout or network error that warrants failover.
   */
  function isFailoverError(error: unknown): boolean {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return (
        // Network / connection errors
        msg.includes('fetch failed') ||
        msg.includes('network') ||
        msg.includes('connection') ||
        msg.includes('econnrefused') ||
        msg.includes('econnreset') ||
        msg.includes('etimedout') ||
        msg.includes('timeout') ||
        msg.includes('aborted') ||
        // Provider errors
        msg.includes('429') || // rate limited
        msg.includes('500') || // server error
        msg.includes('502') || // bad gateway
        msg.includes('503') || // service unavailable
        msg.includes('504') || // gateway timeout
        msg.includes('overloaded') ||
        msg.includes('unavailable') ||
        msg.includes('model not found') ||
        msg.includes('model_not_found') ||
        msg.includes('no available model') ||
        msg.includes('insufficient_quota') ||
        msg.includes('rate limit') ||
        msg.includes('too many requests')
      );
    }
    return false;
  }

  /**
   * Run a model call with a timeout.
   */
  async function withTimeout<T>(
    promise: PromiseLike<T>,
    modelId: string,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(`Model "${modelId}" timed out (idle for ${timeoutMs}ms)`),
        );
      }, timeoutMs);

      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  /**
   * Try to start a stream with the current model, falling back to the next
   * model if it fails.
   */
  async function startStreamWithFailover(
    options: LanguageModelV4CallOptions,
  ): Promise<{ result: LanguageModelV4StreamResult; model: LanguageModelV4 }> {
    let lastError: unknown = null;

    for (let attempt = 0; attempt < models.length; attempt++) {
      const model = getCurrentModel();

      try {
        const result = await withTimeout(model.doStream(options), model.modelId);
        return { result, model };
      } catch (error) {
        lastError = error;

        if (isFailoverError(error) && attempt < models.length - 1) {
          switchToNextModel(
            `stream setup error: ${error instanceof Error ? error.message : 'unknown error'}`,
          );
          continue;
        }

        throw error;
      }
    }

    throw lastError;
  }

  return {
    specificationVersion: 'v4',
    provider: 'openrouter',
    modelId: models[0].modelId,
    supportedUrls: models[0].supportedUrls,

    async doGenerate(
      options: LanguageModelV4CallOptions,
    ): Promise<LanguageModelV4GenerateResult> {
      let lastError: unknown = null;

      // Try each model in sequence
      for (let attempt = 0; attempt < models.length; attempt++) {
        const model = getCurrentModel();

        try {
          const result = await withTimeout(model.doGenerate(options), model.modelId);
          return result;
        } catch (error) {
          lastError = error;

          if (isFailoverError(error) && attempt < models.length - 1) {
            switchToNextModel(
              `generate error: ${error instanceof Error ? error.message : 'unknown error'}`,
            );
            continue;
          }

          // If it's not a failover error or we've exhausted all models, throw
          throw error;
        }
      }

      throw lastError;
    },

    async doStream(
      options: LanguageModelV4CallOptions,
    ): Promise<LanguageModelV4StreamResult> {
      // Start the stream with failover
      const { result, model } = await startStreamWithFailover(options);

      // Wrap the stream to detect mid-stream errors and switch models
      const originalStream = result.stream;
      const reader = originalStream.getReader();
      let currentModel = model;
      let currentReader = reader;
      let retried = false;

      const failoverStream = new ReadableStream<LanguageModelV4StreamPart>({
        async pull(controller) {
          try {
            const { done, value } = await currentReader.read();

            if (done) {
              controller.close();
              return;
            }

            // Check for error parts in the stream
            if (value.type === 'error') {
              const error = value.error;
              if (isFailoverError(error) && !retried) {
                retried = true;
                currentModel = switchToNextModel(
                  `stream error: ${error instanceof Error ? error.message : 'unknown error'}`,
                );

                // Try to restart with the next model
                try {
                  const newResult = await withTimeout(
                    currentModel.doStream(options),
                    currentModel.modelId,
                  );
                  currentReader = newResult.stream.getReader();
                  // Continue reading from the new stream
                  const { done: done2, value: value2 } = await currentReader.read();
                  if (done2) {
                    controller.close();
                  } else {
                    controller.enqueue(value2);
                  }
                  return;
                } catch (retryError) {
                  controller.error(retryError);
                  return;
                }
              }
            }

            controller.enqueue(value);
          } catch (error) {
            // Mid-stream read error - try to switch models
            if (isFailoverError(error) && !retried) {
              retried = true;
              currentModel = switchToNextModel(
                `stream read error: ${error instanceof Error ? error.message : 'unknown error'}`,
              );

              try {
                const newResult = await withTimeout(
                  currentModel.doStream(options),
                  currentModel.modelId,
                );
                currentReader = newResult.stream.getReader();
                // Continue reading from the new stream
                const { done, value } = await currentReader.read();
                if (done) {
                  controller.close();
                } else {
                  controller.enqueue(value);
                }
                return;
              } catch (retryError) {
                controller.error(retryError);
                return;
              }
            }

            controller.error(error);
          }
        },

        cancel() {
          currentReader.cancel();
        },
      });

      return {
        ...result,
        stream: failoverStream,
      };
    },
  };
}