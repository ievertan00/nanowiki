const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);

export class StructuredOutputError extends Error {
  constructor(message, { cause, output } = {}) {
    super(message, { cause });
    this.name = 'StructuredOutputError';
    this.output = output;
  }
}

export function parseJsonObject(text) {
  const cleaned = String(text ?? '').replace(/```json|```/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new StructuredOutputError('Model output does not contain a JSON object.', { output: text });
  let value;
  try {
    value = JSON.parse(cleaned.slice(start, end + 1));
  } catch (cause) {
    throw new StructuredOutputError('Model output contains invalid JSON.', { cause, output: text });
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new StructuredOutputError('Model output must be a JSON object.', { output: text });
  }
  return value;
}

export function validateShape(value, shape, path = '$') {
  const errors = [];
  for (const [key, rule] of Object.entries(shape)) {
    const item = value[key];
    if (item === undefined) {
      errors.push(`${path}.${key} is required`);
      continue;
    }
    if (rule === 'array' ? !Array.isArray(item) : typeof item !== rule) errors.push(`${path}.${key} must be ${rule}`);
  }
  return errors;
}

function retryable(error) {
  return RETRYABLE_STATUS.has(error?.status) || ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED'].includes(error?.code);
}

export async function completeChat(client, payload, { attempts = 3, delay = ms => new Promise(resolve => setTimeout(resolve, ms)), schema = null } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const result = await client.chat.completions.create(payload);
      const content = result?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') throw new StructuredOutputError('Model response is missing message content.');
      if (!schema) return content;
      const parsed = parseJsonObject(content);
      const errors = validateShape(parsed, schema);
      if (errors.length) throw new StructuredOutputError(`Structured output validation failed: ${errors.join('; ')}`, { output: content });
      return parsed;
    } catch (error) {
      lastError = error;
      const canRetry = attempt < attempts && (retryable(error) || error instanceof StructuredOutputError);
      if (!canRetry) throw error;
      await delay(100 * (2 ** (attempt - 1)));
    }
  }
  throw lastError;
}
