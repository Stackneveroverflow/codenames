import { describe, expect, it } from "vitest";

import packageJson from "../../../package.json";
import { appVersion, appVersionLabel } from "./version";

describe("release version", () => {
  it("keeps the app version label in sync with package.json", () => {
    expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(appVersion).toBe(packageJson.version);
    expect(appVersionLabel).toBe(`v${packageJson.version}`);
  });
});
