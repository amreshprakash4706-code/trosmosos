export class TrosmosError extends Error {
  status: number;
  code: string;
  constructor(status: number, message: string, code = "TROSMOS") {
    super(message);
    this.name = "TrosmosError";
    this.status = status;
    this.code = code;
  }
}

export function fail(status: number, message: string, code?: string): never {
  throw new TrosmosError(status, message, code ?? httpCode(status));
}

function httpCode(status: number): string {
  if (status === 400) return "VALIDATION";
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 413) return "PAYLOAD_TOO_LARGE";
  if (status === 429) return "RATE_LIMIT";
  if (status === 503) return "UNAVAILABLE";
  return "ERROR";
}

export function publicError(err: unknown): { error: string; code: string; status: number } {
  if (err instanceof TrosmosError) {
    return { error: err.message, code: err.code, status: err.status };
  }
  const anyErr = err as { status?: number; code?: string; message?: string };
  if (typeof anyErr?.status === "number" && anyErr.message) {
    return {
      error: anyErr.message,
      code: anyErr.code || "ERROR",
      status: anyErr.status,
    };
  }
  return { error: "Something went wrong", code: "ERROR", status: 500 };
}
