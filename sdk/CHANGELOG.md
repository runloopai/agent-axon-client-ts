# Changelog

## [0.4.1](https://github.com/runloopai/agent-axon-client-ts/compare/agent-axon-client-v0.4.0...agent-axon-client-v0.4.1) (2026-04-15)


### Features

* **examples:** add agent examples and compatability matrix generator ([#88](https://github.com/runloopai/agent-axon-client-ts/issues/88)) ([52c86ba](https://github.com/runloopai/agent-axon-client-ts/commit/52c86ba54a3e99b273765e30cd89120e6022780d))
* **sdk:** add link to docs from package & readme ([#91](https://github.com/runloopai/agent-axon-client-ts/issues/91)) ([3d431fb](https://github.com/runloopai/agent-axon-client-ts/commit/3d431fbec53b82d61d2d10731bfccd0e209e06d9))


### Bug Fixes

* **project:** update readme to reflect bugs fixed and new sdk support ([#87](https://github.com/runloopai/agent-axon-client-ts/issues/87)) ([883cef3](https://github.com/runloopai/agent-axon-client-ts/commit/883cef3b452a4e3d69531b21895a9e1883349082))

## [0.4.0](https://github.com/runloopai/agent-axon-client-ts/compare/agent-axon-client-v0.3.0...agent-axon-client-v0.4.0) (2026-04-13)


### ⚠ BREAKING CHANGES

* **sdk:** unified timeline event stream, replay support, and multi-agent combined-app ([#65](https://github.com/runloopai/agent-axon-client-ts/issues/65))

### Features

* **examples:** add combined-app demo with Claude + ACP support ([#59](https://github.com/runloopai/agent-axon-client-ts/issues/59)) ([05ed899](https://github.com/runloopai/agent-axon-client-ts/commit/05ed8991c67ed831464453f4c88fe6e3dceabce6))
* **sdk:** unified timeline event stream, replay support, and multi-agent combined-app ([#65](https://github.com/runloopai/agent-axon-client-ts/issues/65)) ([9ac33ba](https://github.com/runloopai/agent-axon-client-ts/commit/9ac33baf638dc50b80c71a4e831e5455191c413b))

## [0.3.0](https://github.com/runloopai/agent-axon-client-ts/compare/agent-axon-client-v0.2.0...agent-axon-client-v0.3.0) (2026-04-07)


### ⚠ BREAKING CHANGES

* **sdk:** homogenize ACP and Claude connection APIs ([#48](https://github.com/runloopai/agent-axon-client-ts/issues/48))

### Features

* **sdk:** homogenize ACP and Claude connection APIs ([#48](https://github.com/runloopai/agent-axon-client-ts/issues/48)) ([cf3bfbf](https://github.com/runloopai/agent-axon-client-ts/commit/cf3bfbfa5fd19f8dd228b72a7f645f10ccd77722))


### Bug Fixes

* **acp:** update event source for acp to be `acp-sdk-client` from `broker-transport` ([#51](https://github.com/runloopai/agent-axon-client-ts/issues/51)) ([d9ae252](https://github.com/runloopai/agent-axon-client-ts/commit/d9ae2521410e3e43db542547891a04475f759c27))
* **sdk:** harden error handling, lifecycle guards, and resource cleanup ([#50](https://github.com/runloopai/agent-axon-client-ts/issues/50)) ([eda5c63](https://github.com/runloopai/agent-axon-client-ts/commit/eda5c634186b62903a5ecb8a6d8dbeb2682230df))
* **sdk:** pass after_sequence on SSE reconnect to resume from last event ([#55](https://github.com/runloopai/agent-axon-client-ts/issues/55)) ([03cbb45](https://github.com/runloopai/agent-axon-client-ts/commit/03cbb45ee2c68204061f26d57b92dd5df8560baf))

## [0.2.0](https://github.com/runloopai/agent-axon-client-ts/compare/agent-axon-client-v0.1.2...agent-axon-client-v0.2.0) (2026-04-03)


### ⚠ BREAKING CHANGES

* **sdk:** Connection constructor signatures and callback names changed.

### Features

* **claude:** add control request handler for mid turn agent control flow ([#35](https://github.com/runloopai/agent-axon-client-ts/issues/35)) ([d6f1e35](https://github.com/runloopai/agent-axon-client-ts/commit/d6f1e35dc0d27139f1ebe3e3e4f6565524fe873d))
* **sdk:** align ACP and Claude connection APIs ([#44](https://github.com/runloopai/agent-axon-client-ts/issues/44)) ([a978c65](https://github.com/runloopai/agent-axon-client-ts/commit/a978c65bb29670d80307932730e331ffc933f784))

## [0.1.2](https://github.com/runloopai/agent-axon-client-ts/compare/agent-axon-client-v0.1.1...agent-axon-client-v0.1.2) (2026-04-02)


### Bug Fixes

* remove helper method for now ([#22](https://github.com/runloopai/agent-axon-client-ts/issues/22)) ([89e85f9](https://github.com/runloopai/agent-axon-client-ts/commit/89e85f90273be0d822261d0528e7e291b5238d0e))

## [0.1.1](https://github.com/runloopai/agent-axon-client-ts/compare/agent-axon-client-v0.1.0...agent-axon-client-v0.1.1) (2026-04-02)


### Bug Fixes

* correct package.json for releasing NPM package ([#12](https://github.com/runloopai/agent-axon-client-ts/issues/12)) ([b6e1496](https://github.com/runloopai/agent-axon-client-ts/commit/b6e1496147188a6eea5127b1378fb51b11c62638))
