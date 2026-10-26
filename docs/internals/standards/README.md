# Engineering standards

Only constraints that must hold across code owners belong here. Start with the repository's actual ESLint, TypeScript, Nx and test configurations; consult a relevant document when a boundary is not obvious.

- [Architecture and module layering](./architecture.md)
- [Contract modules](./contract-module-development-spec.md)
- [Client boundaries](./domain-client-spec.md) · [Server boundaries](./domain-server-spec.md) · [Events](./domain-event-spec.md)
- [Failure and outcome contracts](./failure-and-outcome-contracts.md)
- [Imports](./import-path-policy.md) · [Monorepo build resolution](./monorepo-build-standard.md)
- [Value objects](./domain-shared-type-value-object-spec.md) · [Class value objects](./domain-shared-class-value-object-spec.md)

Other specific rules are reference material, not mandatory reading for every task. Don't reproduce config or implementation details in new docs.
