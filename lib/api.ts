export function cleanText(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function isOneOf<T extends string>(
  value: unknown,
  options: readonly T[],
): value is T {
  return typeof value === "string" && options.includes(value as T);
}

export function apiError(error: unknown) {
  console.error("API request failed", error);
  const message = error instanceof Error ? error.message : "";
  if (message.includes("UNIQUE constraint failed")) {
    return Response.json({ error: "رکوردی با همین شناسه یا ایمیل قبلاً ثبت شده است." }, { status: 409 });
  }
  return Response.json({ error: "درخواست انجام نشد. دوباره تلاش کنید." }, { status: 500 });
}
