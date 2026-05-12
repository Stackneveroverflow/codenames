import { describe, expect, it } from "vitest";

import packageJson from "../../../package.json";
import { appVersion, appVersionLabel } from "./version";

describe("release version", () => {
  it("is prepared for the 0.9.0 release", () => {
    expect(packageJson.version).toBe("0.9.0");
    expect(appVersion).toBe(packageJson.version);
    expect(appVersionLabel).toBe("v0.9.0");
  });
});
