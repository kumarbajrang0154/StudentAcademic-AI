import { describe, it, expect } from "vitest";
import HomePage from "./src/app/page.js";

describe("apps/web home page", () => {
  it("renders the component placeholder function", () => {
    const element = HomePage();
    expect(element).toBeDefined();
  });
});
