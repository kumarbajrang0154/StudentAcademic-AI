import { describe, it, expect, vi } from "vitest";
import HomePage from "./page.js";

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useEffect: vi.fn(),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: null,
    isLoading: false,
  }),
}));

describe("apps/web home page", () => {
  it("renders the component placeholder function", () => {
    const element = HomePage();
    expect(element).toBeDefined();
  });
});
