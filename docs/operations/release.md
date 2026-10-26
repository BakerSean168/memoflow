# Release

Normal feature PRs can merge after required PR checks pass. Main CI runs independently; **a merge does not publish a release**. The release process is a separate operator action with exact-SHA evidence.

## Current workflow

1. Choose a release milestone and trigger [`Prepare Release`](../../.github/workflows/release-please.yml) on `main`. The workflow checks the current main SHA and its successful CI evidence before creating or updating the release-please PR.
2. Review and merge the release PR. The new merge commit must have a successful **exact-SHA main CI**; CI from a different commit is not sufficient.
3. [`Release Publish`](../../.github/workflows/release-publish.yml) verifies release identity, creates the draft GitHub Release/tag, and invokes the Desktop and image release lanes.
4. [Desktop assets](../../.github/workflows/release-assets.yml) and [Docker images](../../.github/workflows/publish-images.yml) produce verifiable release artifacts. Publication occurs only after the required postflight evidence is complete.
5. Deploying or selecting a published release for production remains a separate operation; it does not follow from the tag alone. See [Deployment](./deployment.md).

If a release lane fails, the release remains Draft; correct the root cause and retry against the same immutable tag/SHA according to the workflow. Do not move immutable tags, skip evidence gates or publish failed Drafts manually.

Scheduled [Nightly Audit](../../.github/workflows/nightly-audit.yml) is a separate quality lane, not a shortcut around release gates. The `.github/workflows/` files and exact artifact manifests are the execution truth.

For architectural reasons and deployment contracts, consult [Release Lifecycle V3](../internals/release-lifecycle-v3.md) and [Delivery Platform](../internals/delivery-platform-v3.md) when relevant. GitHub Issues hold pending release work; this runbook contains no phase plans or historical operator handoff reports.
