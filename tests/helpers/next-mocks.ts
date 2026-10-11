import { vi } from "vitest";

/** In-memory cookie jar standing in for next/headers during integration tests. */
export const jar = new Map<string, string>();
export const reqHeaders = new Headers({ "user-agent": "vitest", "x-forwarded-for": "10.0.0.1" });

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (jar.has(k) ? { name: k, value: jar.get(k)! } : undefined),
    set: (k: string, v: string) => void jar.set(k, v),
    delete: (k: string) => void jar.delete(k),
  }),
  headers: async () => reqHeaders,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`NEXT_REDIRECT:${to}`); } }));
