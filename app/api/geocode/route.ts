import { searchIndianLocations } from "@/lib/geocoding";

export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "no-store",
};

function jsonError(status: number, code: string, message: string): Response {
  return Response.json(
    { error: { code, message } },
    { status, headers: noStoreHeaders },
  );
}

export async function GET(request: Request): Promise<Response> {
  const queryValues = new URL(request.url).searchParams.getAll("q");

  if (queryValues.length === 0) {
    return jsonError(400, "MISSING_QUERY", "Provide a location search query in q.");
  }

  if (queryValues.length > 1) {
    return jsonError(400, "DUPLICATE_QUERY", "Provide only one q parameter.");
  }

  const query = queryValues[0].trim();
  if (query.length < 2) {
    return jsonError(
      400,
      "INVALID_QUERY",
      "The q parameter must contain at least 2 characters.",
    );
  }

  if (query.length > 100) {
    return jsonError(
      400,
      "INVALID_QUERY",
      "The q parameter must not exceed 100 characters.",
    );
  }

  try {
    const results = await searchIndianLocations(query);
    return Response.json({ results }, { status: 200, headers: noStoreHeaders });
  } catch {
    console.error("Indian location search failed.");
    return jsonError(
      502,
      "GEOCODING_UPSTREAM_FAILURE",
      "Unable to search locations right now. Please try again later.",
    );
  }
}
