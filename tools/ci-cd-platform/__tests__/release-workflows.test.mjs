import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readRepoFile = (path) => readFile(new URL(`../../../${path}`, import.meta.url), 'utf8');

function workflowStep(workflow, name) {
  const marker = `- name: ${name}`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `workflow step not found: ${name}`);
  const next = workflow.indexOf('\n      - name:', start + marker.length);
  return workflow.slice(start, next < 0 ? workflow.length : next);
}

test('release-please maintains the Release PR only after successful main CI and never publishes', async () => {
  const [workflow, config] = await Promise.all([
    readRepoFile('.github/workflows/release-please.yml'),
    readRepoFile('release-please-config.json'),
  ]);

  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /workflows:\s*\[?['"]CI['"]\]?/);
  assert.match(workflow, /types:\s*\[?completed\]?/);
  assert.match(workflow, /branches:\s*\[?main\]?/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /workflow_run\.event == 'push'/);
  assert.match(workflow, /workflow_run\.head_branch == 'main'/);
  assert.match(workflow, /group:\s*prepare-release-main/);
  assert.doesNotMatch(workflow, /push:\s*\n\s*branches:/);
  assert.doesNotMatch(workflow, /gh release|createRelease|createRef|docker\/build-push-action/u);
  assert.match(workflow, /googleapis\/release-please-action@[0-9a-f]{40}/u);
  assert.equal(JSON.parse(config).packages['.']['skip-github-release'], true);
});

test('release publish waits for exact candidate publication then resolves the bound successful main CI before release lanes', async () => {
  const workflow = await readRepoFile('.github/workflows/release-publish.yml');

  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /workflows:\s*\[?['"]?Publish Main Candidate['"]?\]?/);
  assert.match(workflow, /types:\s*\[?completed\]?/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /workflow_id: 'ci\.yml'/);
  assert.match(workflow, /candidateRun\.head_sha !== sha/u);
  assert.match(workflow, /candidateRun\.head_branch !== 'main'/u);
  assert.match(workflow, /release-assets\.yml/);
  assert.match(
    workflow,
    /macos_signing_mode: \$\{\{ vars\.MACOS_RELEASE_MODE \|\| 'unsigned-pilot' \}\}/,
  );
  assert.match(workflow, /publish-images\.yml/);
  assert.match(workflow, /draft:\s*true|draft: true/);
  assert.match(workflow, /release-manifest\.json/);
  assert.match(workflow, /--draft=false/);
  assert.match(workflow, /pull-requests: write/);
  assert.match(workflow, /merge_commit_sha === sha/);
  assert.match(workflow, /github\.paginate\(github\.rest\.repos\.listReleases/u);
  assert.match(workflow, /release\.tag_name === tag/u);
  assert.match(workflow, /matches\.length > 1/u);
  assert.match(workflow, /ambiguous release records/u);
  assert.doesNotMatch(workflow, /getReleaseByTag/u);
  assert.match(workflow, /autorelease: pending/);
  assert.match(workflow, /autorelease: tagged/);
  assert.match(workflow, /needs\.prepare\.result == 'success'/);
  assert.doesNotMatch(workflow, /needs\.finalize\.result == 'success'/);
});

test('release validation checkouts retain merge-parent history', async () => {
  const [caller, assets, images] = await Promise.all([
    readRepoFile('.github/workflows/release-publish.yml'),
    readRepoFile('.github/workflows/release-assets.yml'),
    readRepoFile('.github/workflows/publish-images.yml'),
  ]);

  const prepareCheckout = workflowStep(caller, 'Checkout exact release SHA');
  const desktopCheckout = workflowStep(assets, 'Checkout exact release source');
  const dockerCheckout = workflowStep(images, 'Checkout exact release tooling');

  assert.match(prepareCheckout, /ref: \$\{\{ needs\.resolve\.outputs\.sha \}\}/);
  assert.match(desktopCheckout, /ref: \$\{\{ needs\.prepare-release\.outputs\.release_sha \}\}/);
  assert.match(dockerCheckout, /ref: \$\{\{ needs\.prepare-release\.outputs\.release_sha \}\}/);
  for (const step of [prepareCheckout, desktopCheckout, dockerCheckout]) {
    assert.match(step, /fetch-depth:\s*0/);
  }
});

test('desktop assets and image publishing are reusable retryable lanes, not publish-event or tag-push side effects', async () => {
  const [assets, images] = await Promise.all([
    readRepoFile('.github/workflows/release-assets.yml'),
    readRepoFile('.github/workflows/publish-images.yml'),
  ]);

  for (const workflow of [assets, images]) {
    assert.match(workflow, /workflow_call:/);
    assert.match(workflow, /workflow_dispatch:/);
  }
  assert.doesNotMatch(assets, /release:\s*\n\s*types:\s*\n\s*- published/);
  assert.doesNotMatch(images, /push:\s*\n\s*tags:/);
  assert.match(assets, /desktop-release-manifest\.json/);
  assert.match(images, /docker-release-manifest\.json/);
  assert.doesNotMatch(images, /prod-latest/);
  assert.match(images, /requested SHA was/);
});

test('desktop packaging has one stable product identity and one native rebuild owner', async () => {
  const [packageText, builder, projectText, workflow, nativeRebuildHelper] = await Promise.all([
    readRepoFile('apps/desktop/package.json'),
    readRepoFile('apps/desktop/electron-builder.json5'),
    readRepoFile('apps/desktop/project.json'),
    readRepoFile('.github/workflows/release-assets.yml'),
    readRepoFile('apps/desktop/scripts/rebuild-native-dependencies.mjs'),
  ]);
  const packageJson = JSON.parse(packageText);
  const project = JSON.parse(projectText);

  assert.equal(packageJson.productName, 'MemoFlow');
  assert.equal(packageJson.desktopName, 'memoflow.desktop');
  assert.equal(packageJson.dependencies['dotenv-expand'], '13.0.0');
  assert.equal(packageJson.devDependencies['@electron/rebuild'], undefined);
  assert.match(builder, /"appId": "com\.memoflow\.app"/);
  assert.match(builder, /"productName": "MemoFlow"/);
  assert.match(builder, /"executableName": "memoflow"/);
  assert.match(builder, /"desktopName": "memoflow\.desktop"/);
  assert.match(builder, /"syncDesktopName": true/);
  assert.match(builder, /"npmRebuild": false/);
  assert.match(builder, /\.\.\/\.\.\/packages\/assets\/dist\/images\/logos\/MemoFlow\.ico/);
  assert.match(builder, /\.\.\/\.\.\/packages\/assets\/dist\/images\/logos\/MemoFlow-512\.png/);
  assert.match(builder, /"from": "\.\.\/\.\.\/packages\/database"/);
  assert.match(builder, /"to": "node_modules\/@memoflow\/database"/);
  assert.match(builder, /"from": "\.\.\/\.\.\/node_modules\/dotenv-expand"/);
  assert.deepEqual(project.targets.package.dependsOn, ['build']);
  assert.deepEqual(project.targets.dist.dependsOn, ['build']);
  assert.match(project.targets.package.options.commands[0], /rebuild-native-dependencies\.mjs/);
  assert.match(project.targets.dist.options.commands[0], /rebuild-native-dependencies\.mjs/);
  assert.match(
    project.targets['native-rebuild'].options.command,
    /rebuild-native-dependencies\.mjs/,
  );

  assert.match(workflow, /Checkout release packaging tooling/);
  assert.match(workflow, /ref: \$\{\{ github\.workflow_sha \}\}/);
  assert.match(workflow, /path: release-tooling/);
  assert.match(workflow, /Checkout exact release source/);
  assert.match(workflow, /path: release-source/);
  assert.match(workflow, /release-tooling\/apps\/desktop\/electron-builder\.json5/);
  const resolverStep = workflowStep(workflow, 'Resolve packaged Desktop executable');
  assert.match(
    resolverStep,
    /release-tooling\/apps\/desktop\/scripts\/resolve-packaged-executable\.mjs/,
  );
  assert.doesNotMatch(
    resolverStep,
    /node \.\/apps\/desktop\/scripts\/resolve-packaged-executable\.mjs/u,
  );
  assert.match(workflow, /name: Download build artifacts[\s\S]*?pattern: desktop-\*/);
  assert.doesNotMatch(workflow, /desktop:dist/);
  assert.doesNotMatch(workflow, /npm_config_msvs_version/);
  assert.match(workflow, /msbuild-architecture: x64/);
  const nativeRebuild = workflowStep(workflow, 'Rebuild native dependencies for Electron');
  assert.match(nativeRebuild, /working-directory: release-source/u);
  assert.match(
    nativeRebuild,
    /release-tooling\/apps\/desktop\/scripts\/rebuild-native-dependencies\.mjs/u,
  );
  assert.match(nativeRebuild, /--workspace-root/u);
  assert.match(nativeRebuild, /matrix\.platform_os/u);
  assert.match(nativeRebuild, /matrix\.arch/u);
  assert.doesNotMatch(nativeRebuild, /if: runner\.os == 'Windows'/u);
  assert.match(nativeRebuildHelper, /projectRootPath: workspaceRoot/u);
  assert.match(nativeRebuildHelper, /onlyModules: REQUIRED_MODULES/u);
  assert.match(nativeRebuildHelper, /\['argon2', 'better-sqlite3'\]/u);
  assert.match(nativeRebuildHelper, /mode: 'sequential'/u);
  assert.match(nativeRebuildHelper, /modules-found/u);
  assert.match(nativeRebuildHelper, /Electron rebuild did not discover required native module/u);
});

test('release image promotion preserves the candidate top-level digest without OCI wrapper rebuilds', async () => {
  const workflow = await readRepoFile('.github/workflows/publish-images.yml');

  assert.match(workflow, /docker buildx imagetools create --prefer-index=false/u);
  assert.match(workflow, /Manifest\.Digest/u);
  assert.doesNotMatch(workflow, /docker\/build-push-action/u);
  assert.doesNotMatch(workflow, /provenance:\s*(?:true|false)|sbom:\s*(?:true|false)/u);
});

test('release tooling exposes fail-closed identity and evidence builders', async () => {
  const [contract, desktop, docker, aggregate] = await Promise.all([
    readRepoFile('tools/ci-cd-platform/release-tools/release-contract.mjs'),
    readRepoFile('tools/ci-cd-platform/release-tools/create-desktop-manifest.mjs'),
    readRepoFile('tools/ci-cd-platform/release-tools/create-docker-manifest.mjs'),
    readRepoFile('tools/ci-cd-platform/release-tools/build-release-manifest.mjs'),
  ]);
  assert.match(contract, /release identity mismatch/);
  assert.match(contract, /CHANGELOG\.md has no release heading/);
  assert.match(desktop, /sha256/);
  assert.match(docker, /CANDIDATE_MANIFEST/);
  assert.match(aggregate, /release identity mismatch/);
  assert.match(aggregate, /docker CI run mismatch/);
  assert.match(aggregate, /docker release candidate-set binding mismatch/);
});

test('release image publication carbon-copies one exact candidate to China ACR and global GHCR without rebuild', async () => {
  const [workflow, caller] = await Promise.all([
    readRepoFile('.github/workflows/publish-images.yml'),
    readRepoFile('.github/workflows/release-publish.yml'),
  ]);

  assert.match(workflow, /packages:\s*write/);
  assert.match(caller, /packages:\s*write/);
  assert.match(workflow, /candidate-publish\.yml/u);
  assert.match(workflow, /candidate-set-\$\{\{ needs\.prepare-release\.outputs\.release_sha \}\}/u);
  assert.match(workflow, /candidate-manifest\.mjs --validate/u);
  assert.match(workflow, /name: Login to ACR/u);
  assert.match(workflow, /name: Login to GHCR/u);
  assert.match(workflow, /Preflight immutable candidate and release-tag collisions/u);
  assert.match(workflow, /Carbon-copy candidate digests to release tags/u);
  assert.match(workflow, /docker buildx imagetools create --prefer-index=false/u);
  assert.match(workflow, /Verify release tags preserve candidate digests/u);
  assert.doesNotMatch(workflow, /docker\/build-push-action/u);
  assert.doesNotMatch(workflow, /ci-build-artifacts/u);
  assert.doesNotMatch(workflow, /restore-runtime-closure/u);
  assert.doesNotMatch(workflow, /Dockerfile\.(?:api|web)/u);
  assert.match(workflow, /candidate-set-v1\.json docker-release-manifest\.json/u);
  assert.match(caller, /ci_run_id:\s*\$\{\{ needs\.resolve\.outputs\.ci_run_id \}\}/u);
  assert.match(caller, /candidate-set-v1\.json/u);
});

test('production compose allows China-mirrored runtime dependencies without changing service contracts', async () => {
  const compose = await readRepoFile('docker-compose.prod.yml');

  assert.match(compose, /image: \$\{POSTGRES_IMAGE:-pgvector\/pgvector:0\.8\.5-pg18\}/);
  assert.match(compose, /image: \$\{REDIS_IMAGE:-redis:8-alpine\}/);
  assert.match(compose, /image: \$\{CADDY_IMAGE:-caddy:2-alpine\}/);
  assert.match(compose, /image: \$\{POWERSYNC_IMAGE:-journeyapps\/powersync-service:1\.25\.0\}/);
  assert.match(compose, /image: \$\{WATCHTOWER_IMAGE:-containrrr\/watchtower\}/);
  assert.match(compose, /image: \$\{MIGRATOR_IMAGE:-\$\{REGISTRY:/);
  assert.match(compose, /image: \$\{API_IMAGE:-\$\{REGISTRY:/);
  assert.match(compose, /image: \$\{WEB_IMAGE:-\$\{REGISTRY:/);
});

test('runtime dependencies are digest-pinned and mirrored to both China and global registries', async () => {
  const [workflow, configText] = await Promise.all([
    readRepoFile('.github/workflows/mirror-runtime-images.yml'),
    readRepoFile('tools/ci-cd-platform/runtime-image-mirrors.json'),
  ]);
  const config = JSON.parse(configText);
  assert.deepEqual(config.images.map((entry) => entry.name).sort(), [
    'memoflow-caddy',
    'memoflow-postgres',
    'memoflow-powersync',
    'memoflow-redis',
    'memoflow-watchtower',
  ]);
  for (const entry of config.images) {
    assert.match(entry.source, /@sha256:[a-f0-9]{64}$/);
    assert.equal(entry.platform, 'linux/amd64');
    assert.match(entry.tag, /^[a-z0-9][a-z0-9._-]+$/);
    const digest = entry.source.split('@sha256:')[1];
    assert.equal(entry.tag.endsWith(digest.slice(0, 12)), true);
  }
  const powersync = config.images.find((entry) => entry.name === 'memoflow-powersync');
  assert.equal(
    powersync.source,
    'docker.io/journeyapps/powersync-service@sha256:58003bcf4897a36bec948a10d2f37753a1188270330d43757caa2aa8dfe2d0b8',
  );
  assert.equal(powersync.tag, '1.25.0-58003bcf4897');
  const [powersyncBake, developmentCompose] = await Promise.all([
    readRepoFile('docker/powersync/Dockerfile.bake'),
    readRepoFile('docker-compose.yml'),
  ]);
  assert.match(powersyncBake, /FROM journeyapps\/powersync-service:1\.25\.0/u);
  assert.doesNotMatch(powersyncBake, /powersync-service:latest/u);
  assert.equal(
    (developmentCompose.match(/journeyapps\/powersync-service:1\.25\.0/gmu) ?? []).length,
    2,
  );
  assert.doesNotMatch(developmentCompose, /powersync-service:latest/u);
  assert.match(workflow, /push:\s*\n\s*branches:\s*\[main\]/);
  assert.match(workflow, /runtime-image-mirrors\.json/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /packages:\s*write/);
  assert.match(workflow, /Login to ACR/);
  assert.match(workflow, /Login to GHCR/);
  assert.match(workflow, /skopeo copy --preserve-digests/);
  assert.doesNotMatch(workflow, /skopeo copy --all/);
  assert.match(workflow, /china_digest/);
  assert.match(workflow, /global_digest/);
  assert.match(workflow, /source_digest/);
});

test('Desktop release matrix covers Windows, Linux, macOS Intel and Apple Silicon with fail-closed receipts', async () => {
  const [workflow, builder, signedBuilder, receipt, manifest, signingPolicy, trustVerifier] =
    await Promise.all([
      readRepoFile('.github/workflows/release-assets.yml'),
      readRepoFile('apps/desktop/electron-builder.json5'),
      readRepoFile('apps/desktop/electron-builder.macos-signed.json5'),
      readRepoFile('tools/ci-cd-platform/release-tools/write-desktop-platform-receipt.mjs'),
      readRepoFile('tools/ci-cd-platform/release-tools/create-desktop-manifest.mjs'),
      readRepoFile('tools/ci-cd-platform/release-tools/macos-signing-policy.mjs'),
      readRepoFile('tools/ci-cd-platform/release-tools/verify-macos-trust.mjs'),
    ]);

  for (const platform of ['windows-x64', 'linux-x64', 'macos-x64', 'macos-arm64']) {
    assert.match(workflow, new RegExp(`platform: ${platform}`));
    assert.match(manifest, new RegExp(`['"]${platform}['"]`));
  }
  assert.match(workflow, /os: macos-15-intel[\s\S]*?builder_args: --mac dmg zip --x64/);
  assert.match(workflow, /os: macos-15[\s\S]*?builder_args: --mac dmg zip --arm64/);
  assert.match(workflow, /macos_signing_mode:[\s\S]*?default: unsigned-pilot/);
  assert.match(
    workflow,
    /Desktop signing policy did not emit explicit signing_state and signed_mode outputs/u,
  );
  assert.match(workflow, /- signed-notarized/);
  assert.match(workflow, /signing_state: macos-policy/);
  assert.match(workflow, /Resolve Desktop signing policy/);
  assert.match(workflow, /Prepare protected macOS signing credentials/);
  assert.match(workflow, /MACOS_CSC_LINK: \$\{\{ secrets\.MACOS_CSC_LINK \}\}/);
  assert.match(workflow, /MACOS_APPLE_API_KEY_P8: \$\{\{ secrets\.MACOS_APPLE_API_KEY_P8 \}\}/);
  assert.match(workflow, /CSC_IDENTITY_AUTO_DISCOVERY: 'false'/);
  assert.match(workflow, /CSC_IDENTITY_AUTO_DISCOVERY: 'true'/);
  assert.match(workflow, /electron-builder\.macos-signed\.json5/);
  assert.match(workflow, /Verify signed\/notarized macOS trust/);
  assert.match(workflow, /reports\/ci-cd-platform\/desktop-trust/);
  assert.match(workflow, /write-desktop-platform-receipt\.mjs/);
  assert.match(workflow, /resolve-desktop-release-assets\.mjs/);
  assert.match(workflow, /verify-desktop-release-assets\.mjs/);
  assert.match(builder, /\$\{productName\}-macOS-\$\{arch\}-\$\{version\}/);
  assert.match(signedBuilder, /forceCodeSigning:\s*true/);
  assert.match(signedBuilder, /hardenedRuntime:\s*true/);
  assert.match(signedBuilder, /notarize:\s*true/);
  assert.match(signingPolicy, /signed-notarized/);
  assert.match(signingPolicy, /MACOS_APPLE_API_KEY_P8/);
  assert.match(trustVerifier, /Developer ID Application/);
  assert.match(trustVerifier, /Notarized Developer ID/);
  assert.match(trustVerifier, /stapler/);
  assert.match(trustVerifier, /spctl/);
  assert.match(receipt, /signed-notarized/);
  assert.match(receipt, /macOS trust receipt/);
  assert.match(manifest, /missing required Desktop platform/);
  assert.match(manifest, /duplicate Desktop release asset name/);
});

test('touched V3 release workflows pin external actions by immutable commit', async () => {
  const workflows = await Promise.all([
    readRepoFile('.github/workflows/release-please.yml'),
    readRepoFile('.github/workflows/release-assets.yml'),
    readRepoFile('.github/workflows/release-publish.yml'),
    readRepoFile('.github/workflows/publish-images.yml'),
  ]);
  for (const workflow of workflows) {
    const externalUses = [...workflow.matchAll(/uses:\s+([^./\s][^@\s]+)@([^\s#]+)/gu)];
    assert.ok(externalUses.length > 0);
    for (const [, action, ref] of externalUses) {
      assert.match(ref, /^[0-9a-f]{40}$/u, `${action} must use a full commit SHA`);
    }
  }
});

test('CI has one long-lived main branch target and full-main policy is encoded by the manifest generator', async () => {
  const [workflow, generator] = await Promise.all([
    readRepoFile('.github/workflows/ci.yml'),
    readRepoFile('tools/ci-cd-platform/generate-delivery-manifest.mjs'),
  ]);
  assert.equal((workflow.match(/branches:\s*\[main\]/gu) ?? []).length, 1);
  assert.match(
    workflow,
    /pull_request:\s*\n\s*branches: \[main, feat\/system-wide-vnext-convergence\]/u,
  );
  assert.doesNotMatch(workflow, /develop/u);
  assert.match(generator, /event === 'push' && ref === 'refs\/heads\/main'/u);
});

test('Desktop upload and release publication are manifest-owned and verify the remote asset set', async () => {
  const [assets, publish] = await Promise.all([
    readRepoFile('.github/workflows/release-assets.yml'),
    readRepoFile('.github/workflows/release-publish.yml'),
  ]);
  const upload = workflowStep(
    assets,
    'Upload the manifest-owned asset set to the draft GitHub Release',
  );
  assert.match(upload, /resolve-desktop-release-assets\.mjs/);
  assert.match(upload, /expected_count=.*\.assets \| length/);
  assert.match(upload, /verify-desktop-release-assets\.mjs/);
  assert.match(upload, /gh release view .*--json apiUrl/u);
  assert.match(upload, /gh api "\$release_api_url"/u);
  assert.doesNotMatch(upload, /releases\/tags\//u);
  assert.doesNotMatch(upload, /find artifacts.*-name/);

  const remoteGate = workflowStep(
    publish,
    'Verify the remote Draft contains every manifest-owned Desktop asset',
  );
  assert.match(remoteGate, /gh release view .*--json apiUrl/u);
  assert.match(remoteGate, /gh api "\$release_api_url"/u);
  assert.doesNotMatch(remoteGate, /releases\/tags\//u);
  assert.match(remoteGate, /verify-desktop-release-assets\.mjs/);
  assert.ok(
    publish.indexOf('Verify the remote Draft contains every manifest-owned Desktop asset') <
      publish.indexOf('Upload canonical manifest and publish'),
  );
  for (const workflow of [assets, publish]) {
    for (const [, action, ref] of workflow.matchAll(/uses:\s+([^./\s][^@\s]+)@([^\s#]+)/gu)) {
      assert.match(ref, /^[0-9a-f]{40}$/u, `${action} must use a full commit SHA`);
    }
  }
});

test('Desktop release runtime gates execute before receipts and cannot be bypassed', async () => {
  const [workflow, receipt, manifest, helper, packagedSpec] = await Promise.all([
    readRepoFile('.github/workflows/release-assets.yml'),
    readRepoFile('tools/ci-cd-platform/release-tools/write-desktop-platform-receipt.mjs'),
    readRepoFile('tools/ci-cd-platform/release-tools/create-desktop-manifest.mjs'),
    readRepoFile('apps/desktop/scripts/run-linux-packaged-smoke-with-keyring.sh'),
    readRepoFile('apps/desktop/e2e/packaged-runtime/packaged-runtime.spec.ts'),
  ]);

  const unsignedPackageIndex = workflow.indexOf(
    '- name: Package unsigned/default desktop application',
  );
  const signedPackageIndex = workflow.indexOf('- name: Package signed/notarized macOS application');
  const dmgNotarizeIndex = workflow.indexOf('- name: Notarize and staple signed macOS DMG');
  const trustIndex = workflow.indexOf('- name: Verify signed/notarized macOS trust');
  const cleanupIndex = workflow.indexOf('- name: Remove temporary macOS notarization key');
  const packagedSmokeIndex = workflow.indexOf('- name: Run packaged Desktop runtime smoke');
  const diagnosticsIndex = workflow.indexOf('- name: Upload Desktop runtime diagnostics');
  const installDebIndex = workflow.indexOf('- name: Install Linux Debian package');
  const installedSmokeIndex = workflow.indexOf('- name: Run installed Linux Debian runtime smoke');
  const receiptIndex = workflow.indexOf('- name: Write Desktop platform receipt');
  const uploadIndex = workflow.indexOf('- name: Upload build artifacts');
  assert.ok(unsignedPackageIndex < packagedSmokeIndex);
  assert.ok(signedPackageIndex < dmgNotarizeIndex);
  assert.ok(dmgNotarizeIndex < trustIndex);
  assert.ok(trustIndex < cleanupIndex);
  assert.ok(cleanupIndex < packagedSmokeIndex);
  assert.ok(packagedSmokeIndex < diagnosticsIndex);
  assert.ok(diagnosticsIndex < installDebIndex);
  assert.ok(installDebIndex < installedSmokeIndex);
  assert.ok(installedSmokeIndex < receiptIndex);
  assert.ok(receiptIndex < uploadIndex);

  const packagedSmoke = workflowStep(workflow, 'Run packaged Desktop runtime smoke');
  const diagnostics = workflowStep(workflow, 'Upload Desktop runtime diagnostics');
  const installedSmoke = workflowStep(workflow, 'Run installed Linux Debian runtime smoke');
  const installDeb = workflowStep(workflow, 'Install Linux Debian package');
  assert.match(installDeb, /deb_path="\$\(realpath/u);
  assert.match(installDeb, /apt-get install -y "\$deb_path"/u);
  assert.doesNotMatch(installDeb, /apt-get install -y "\$\{debs\[0\]\}"/u);
  for (const step of [packagedSmoke, installedSmoke]) {
    assert.match(step, /timeout-minutes:\s*5/u);
    assert.doesNotMatch(step, /continue-on-error\s*:\s*true/u);
    assert.doesNotMatch(step, /\|\|\s*true/u);
  }
  assert.match(
    packagedSmoke,
    /release-tooling\/apps\/desktop\/scripts\/run-linux-packaged-smoke-with-keyring/u,
  );
  assert.match(packagedSmoke, /MEMOFLOW_PACKAGED_SMOKE_WORKSPACE_ROOT:[^\n]*release-source/u);
  assert.doesNotMatch(
    packagedSmoke,
    /\.\/apps\/desktop\/scripts\/run-linux-packaged-smoke-with-keyring/u,
  );
  assert.match(diagnostics, /if: failure\(\)/u);
  assert.match(diagnostics, /desktop-runtime-diagnostics-\$\{\{ matrix\.platform \}\}/u);
  assert.match(diagnostics, /release-source\/apps\/desktop\/test-results/u);
  assert.match(
    installedSmoke,
    /release-tooling\/apps\/desktop\/scripts\/run-linux-packaged-smoke-with-keyring/u,
  );
  assert.match(installedSmoke, /MEMOFLOW_PACKAGED_SMOKE_WORKSPACE_ROOT:[^\n]*release-source/u);
  assert.match(helper, /test:packaged-smoke/u);
  assert.match(helper, /MEMOFLOW_PACKAGED_SMOKE_WORKSPACE_ROOT/u);
  assert.match(helper, /Invalid packaged-smoke workspace root/u);
  assert.match(
    helper,
    /timeout --signal=TERM --kill-after=15s 210s[\s\S]*?xvfb-run -a dbus-run-session -- bash -lc/u,
  );
  assert.match(
    helper,
    /timeout --signal=TERM --kill-after=15s 150s[\s\S]*?node "\$MEMOFLOW_WORKSPACE_ROOT\/node_modules\/nx\/dist\/bin\/nx\.js"[\s\S]*?run desktop:test:packaged-smoke/u,
  );
  assert.match(helper, /gnome-keyring-daemon --login --components=secrets/u);
  assert.match(helper, /gnome-keyring-daemon --start --components=secrets/u);
  assert.match(helper, /--control-directory="\$control_dir"/u);
  assert.match(helper, /GNOME_KEYRING_CONTROL/u);
  assert.doesNotMatch(helper, /login\.keyring/u);
  assert.doesNotMatch(helper, /gnome-keyring-daemon --unlock/u);
  assert.match(helper, /org\.freedesktop\.DBus\.GetNameOwner/u);
  assert.match(packagedSpec, /ROUTE_READY_TIMEOUT_MS = 45_000/u);
  assert.match(packagedSpec, /SETTINGS_READY_TIMEOUT_MS = 45_000/u);
  assert.match(packagedSpec, /toHaveAttribute\(\s*'data-shell-scene',\s*'settings'/u);
  assert.match(packagedSpec, /getByTestId\('user-settings-view'\)/u);
  assert.match(packagedSpec, /getByTestId\('settings-content-scroll'\)/u);
  assert.match(packagedSpec, /close-timeout/u);
  assert.match(packagedSpec, /kill\('SIGKILL'\)/u);
  assert.match(workflow, /runtime_executable_kind: installed-deb/u);
  assert.match(workflow, /gnome-keyring/u);
  assert.match(
    workflow,
    /write-desktop-platform-receipt\.mjs[\s\S]*?packaged-electron-playwright[\s\S]*?runtime_executable_kind/u,
  );
  assert.match(receipt, /schemaVersion:\s*2/u);
  assert.match(receipt, /runtimeValidation/u);
  assert.match(receipt, /runtime validation must pass/u);
  assert.match(manifest, /runtime validation missing or failed/u);
  assert.match(helper, /org\.freedesktop\.secrets/u);
  assert.match(helper, /MEMOFLOW_PACKAGED_USE_GNOME_KEYRING=1/u);
  assert.match(helper, /xvfb-run -a dbus-run-session -- bash -lc/u);
  assert.ok(
    helper.indexOf('xvfb-run -a dbus-run-session') < helper.indexOf('gnome-keyring-daemon --login'),
  );
  assert.ok(
    helper.indexOf('gnome-keyring-daemon --login') < helper.indexOf('gnome-keyring-daemon --start'),
  );
  assert.ok(helper.indexOf('gnome-keyring-daemon --start') < helper.indexOf('secret-tool store'));
  assert.match(helper, /timeout --signal=TERM --kill-after=2s 10s[\s\S]*?secret-tool store/u);
  assert.match(helper, /secret-tool store/u);
  assert.match(helper, /secret-tool lookup/u);
  assert.match(workflow, /libglib2\.0-bin/u);
  assert.doesNotMatch(helper, /setUsePlainTextEncryption|password-store=basic/u);
});
