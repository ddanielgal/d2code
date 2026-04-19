import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { ConfigProvider, Effect, Option } from "effect";

import {
  resolveDesktopArtifactNameTemplate,
  resolveDesktopBuildDescription,
  resolveDesktopPackageName,
  resolveBuildOptions,
  resolveBuildTargets,
  resolveDesktopBuildIconAssets,
  resolveLinuxDesktopEntry,
  resolveLinuxIconBuildPath,
  resolveDesktopProductName,
  resolveDesktopUpdateChannel,
  resolveMockUpdateServerPort,
  resolveMockUpdateServerUrl,
} from "./build-desktop-artifact.ts";
import { BRAND_ASSET_PATHS } from "./lib/brand-assets.ts";

it.layer(NodeServices.layer)("build-desktop-artifact", (it) => {
  it("resolves the dedicated nightly updater channel from nightly versions", () => {
    assert.equal(resolveDesktopUpdateChannel("0.0.17-nightly.20260413.42"), "nightly");
    assert.equal(resolveDesktopUpdateChannel("0.0.17"), "latest");
  });

  it("switches desktop packaging product names to nightly for nightly builds", () => {
    assert.equal(resolveDesktopProductName("0.0.17"), "D2 Code (Alpha)");
    assert.equal(resolveDesktopProductName("0.0.17-nightly.20260413.42"), "D2 Code (Nightly)");
  });

  it("uses the rebranded desktop package description", () => {
    assert.equal(resolveDesktopBuildDescription(), "D2 Code desktop build");
  });

  it("uses d2code-branded desktop artifact filenames", () => {
    assert.equal(resolveDesktopArtifactNameTemplate(), "D2-Code-${version}-${arch}.${ext}");
  });

  it("uses d2code as the packaged app name", () => {
    assert.equal(resolveDesktopPackageName(), "d2code");
  });

  it("generates linux desktop entry metadata aligned with runtime identity", () => {
    assert.deepStrictEqual(resolveLinuxDesktopEntry("0.0.17"), {
      Name: "D2 Code (Alpha)",
      Comment: "D2 Code desktop build",
      Icon: "d2code",
      StartupWMClass: "d2code",
    });

    assert.deepStrictEqual(resolveLinuxDesktopEntry("0.0.17-nightly.20260413.42"), {
      Name: "D2 Code (Nightly)",
      Comment: "D2 Code desktop build",
      Icon: "d2code",
      StartupWMClass: "d2code",
    });
  });

  it("uses a size-qualified linux icon asset path for electron-builder", () => {
    assert.equal(resolveLinuxIconBuildPath(), "icons/512x512.png");
  });

  it("switches desktop packaging icons to the nightly artwork for nightly versions", () => {
    assert.deepStrictEqual(resolveDesktopBuildIconAssets("0.0.17"), {
      macIconPng: BRAND_ASSET_PATHS.productionMacIconPng,
      linuxIconPng: BRAND_ASSET_PATHS.productionLinuxIconPng,
      windowsIconIco: BRAND_ASSET_PATHS.productionWindowsIconIco,
    });

    assert.deepStrictEqual(resolveDesktopBuildIconAssets("0.0.17-nightly.20260413.42"), {
      macIconPng: BRAND_ASSET_PATHS.nightlyMacIconPng,
      linuxIconPng: BRAND_ASSET_PATHS.nightlyLinuxIconPng,
      windowsIconIco: BRAND_ASSET_PATHS.nightlyWindowsIconIco,
    });
  });

  it("supports comma-separated linux artifact targets", () => {
    assert.deepStrictEqual(resolveBuildTargets("linux", "AppImage, deb"), ["AppImage", "deb"]);
    assert.deepStrictEqual(resolveBuildTargets("linux", "   "), ["AppImage"]);
  });

  it("falls back to the default mock update port when the configured port is blank", () => {
    assert.equal(resolveMockUpdateServerUrl(undefined), "http://localhost:3000");
    assert.equal(resolveMockUpdateServerUrl(4123), "http://localhost:4123");
  });

  it.effect("normalizes mock update server ports from env-style strings", () =>
    Effect.gen(function* () {
      assert.equal(yield* resolveMockUpdateServerPort(undefined), undefined);
      assert.equal(yield* resolveMockUpdateServerPort(""), undefined);
      assert.equal(yield* resolveMockUpdateServerPort("   "), undefined);
      assert.equal(yield* resolveMockUpdateServerPort("4123"), 4123);
    }),
  );

  it.effect("rejects non-numeric or out-of-range mock update ports", () =>
    Effect.gen(function* () {
      const invalidPorts = ["abc", "12.5", "0", "65536"];
      for (const port of invalidPorts) {
        const exit = yield* Effect.exit(resolveMockUpdateServerPort(port));
        assert.equal(exit._tag, "Failure");
      }
    }),
  );

  it.effect("preserves explicit false boolean flags over true env defaults", () =>
    Effect.gen(function* () {
      const resolved = yield* resolveBuildOptions({
        platform: Option.some("mac"),
        target: Option.none(),
        arch: Option.some("arm64"),
        buildVersion: Option.none(),
        outputDir: Option.some("release-test"),
        skipBuild: Option.some(false),
        keepStage: Option.some(false),
        signed: Option.some(false),
        verbose: Option.some(false),
        mockUpdates: Option.some(false),
        mockUpdateServerPort: Option.none(),
      }).pipe(
        Effect.provide(
          ConfigProvider.layer(
            ConfigProvider.fromEnv({
              env: {
                T3CODE_DESKTOP_SKIP_BUILD: "true",
                T3CODE_DESKTOP_KEEP_STAGE: "true",
                T3CODE_DESKTOP_SIGNED: "true",
                T3CODE_DESKTOP_VERBOSE: "true",
                T3CODE_DESKTOP_MOCK_UPDATES: "true",
              },
            }),
          ),
        ),
      );

      assert.equal(resolved.skipBuild, false);
      assert.equal(resolved.keepStage, false);
      assert.equal(resolved.signed, false);
      assert.equal(resolved.verbose, false);
      assert.equal(resolved.mockUpdates, false);
    }),
  );
});
