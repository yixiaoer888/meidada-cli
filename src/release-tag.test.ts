import { describe, expect, test } from "bun:test";
import { validateReleaseTag } from "../scripts/check-release-tag";
import { CLI_VERSION } from "./version";

describe("release tag check", () => {
  test("passes only when the git tag matches package.json version", () => {
    expect(validateReleaseTag(CLI_VERSION, `v${CLI_VERSION}`)).toBe(`Release tag check passed: v${CLI_VERSION}`);
    expect(() => validateReleaseTag(CLI_VERSION, `v${CLI_VERSION}-pre.1`)).toThrow(
      "Git tag 与 package.json 版本不一致",
    );
  });
});
