# Testing architecture

Choose tests by the boundary the change touches; the default local loop is the smallest relevant fast test. CI decides the broader suite from the affected scope.

- [Testing ownership and CI policy](./test-system-v2.md)
- [Types and responsibilities](./architecture.md)
- [Test configurations and helpers](./configuration.md)
- [Web contract tests](./contract-tests.md)
- [CI evidence and required checks](./ci-validation.md)
- [Storybook browser-mode responsibilities](./test-architecture-storybook-browser.md)
- [Local commands](../../operations/testing.md)

Nx targets, test configuration, CI workflow and `.github/rulesets/main.json` define actual behavior. Do not maintain test totals or duplicate config tables in this index.
