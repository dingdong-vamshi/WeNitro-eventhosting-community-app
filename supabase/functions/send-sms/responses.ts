const JSON_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};

export function hookError(status: number, message: string): Response {
  return new Response(
    JSON.stringify({ error: { http_code: status, message } }),
    { status, headers: JSON_HEADERS },
  );
}

export function hookSuccess(): Response {
  return new Response(JSON.stringify({}), {
    status: 200,
    headers: JSON_HEADERS,
  });
}
