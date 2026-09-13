import { describe, it, expect, vi, afterEach } from "vitest";
import { UploadError, uploadLogo } from "./execution";

/**
 * What the launch flow's upload turns a server response into. This is the layer
 * the user actually reads: LaunchConfirm renders the thrown message verbatim in
 * its failure callout, so an unmapped error here shows up as either a stack-ish
 * string or a silent dead end.
 */

const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "logo.png", { type: "image/png" });

type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> | Response;

function mockFetch(impl: FetchImpl) {
  const fn = vi.fn<FetchImpl>(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("uploadLogo", () => {
  it("posts multipart to the same-origin path and returns the stored URL", async () => {
    const sha = "a".repeat(64);
    const fetchMock = mockFetch(() => json({ sha256: sha, logoURI: `/logo/${sha}.webp` }, 200));

    const result = await uploadLogo(png());

    // BOTH fields. The digest is not decoration: `claimLogo` binds the image to
    // the coin by (tokenId, sha256), so an upload that returned only the URL
    // left the caller unable to claim what it had just stored.
    expect(result).toEqual({ sha256: sha, logoURI: `/logo/${sha}.webp` });
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, init] = call!;
    // Same-origin and relative: a cross-origin multipart POST would take a CORS
    // preflight, and an absolute URL would bake the service host into the bundle.
    expect(url).toBe("/token-logo");
    expect(String(url).startsWith("http")).toBe(false);
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.body as FormData).get("file")).toBeInstanceOf(File);
  });

  it("surfaces the service's own message, which is written for the user", async () => {
    mockFetch(() => json({ error: "SVG isn't supported. Upload a PNG, JPEG, WebP or AVIF." }, 400));
    await expect(uploadLogo(png())).rejects.toThrow(/SVG isn't supported/);
    await expect(uploadLogo(png())).rejects.toBeInstanceOf(UploadError);
  });

  it("explains a throttle rather than reporting a bare failure", async () => {
    mockFetch(() => new Response("", { status: 429 }));
    await expect(uploadLogo(png())).rejects.toThrow(/Too many uploads/);
  });

  it("does not leak a proxy's HTML error page into the UI", async () => {
    // A 502 from an edge proxy returns HTML, not our { error } shape. Parsing it
    // as JSON fails, and the user must still get a sentence they can act on.
    mockFetch(() => new Response("<html>502 Bad Gateway</html>", { status: 502 }));
    await expect(uploadLogo(png())).rejects.toThrow(/couldn't be stored/i);
  });

  it("reports an unreachable service as a connection problem", async () => {
    mockFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    await expect(uploadLogo(png())).rejects.toThrow(/Couldn't reach the image service/);
  });

  it("rejects a success response that has no logoURI", async () => {
    // A 200 with the wrong shape would otherwise write `undefined` into the
    // receipt and render a broken image on the result screen.
    mockFetch(() => json({ sha256: "a".repeat(64) }, 200));
    await expect(uploadLogo(png())).rejects.toThrow(/unexpected response/);
  });

  it("rejects a success response that has no sha256, because it could not be claimed", async () => {
    // Reachable only through a service change, and it must not pass silently: a
    // logoURI with no digest uploads fine, renders on the confirmation screen,
    // and can never be bound to the coin — which is precisely the failure this
    // whole path exists to end.
    mockFetch(() => json({ logoURI: "/logo/abc.webp" }, 200));
    await expect(uploadLogo(png())).rejects.toThrow(/unexpected response/);
  });

  it("propagates an abort untouched so a cancelled upload isn't shown as an error", async () => {
    mockFetch(() => Promise.reject(new DOMException("aborted", "AbortError")));
    await expect(uploadLogo(png())).rejects.toBeInstanceOf(DOMException);
  });
});
