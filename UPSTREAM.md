# Upstream and adaptation record

Primary user-specified upstream: https://github.com/trytotapeout/TapeBrowser
Pinned commit: `5f1d82cc2f43338477a9f8a8d04ba2d218b7b85f` (TapeBrowser 0.13.0).
License: **GPL-3.0-or-later** according to upstream package.json; complete GPLv3 text retained in LICENSE and vendor/TapeBrowser-LICENSE. Distribution of this derivative must retain applicable source/license obligations.

The browser shell, menus, tab lifecycle, library and local tools are adapted from this pinned upstream. FAB uses chain-registered IPFS releases and the existing FAB developer center for publication.

Additional protocol/design reference: TapeOutProtocol/TapeKit at commit `4c0fdfabebab83a3d9d2968ebe38c833bcddab51`, especially apps/tapesend/electron/main.mjs and preload.cjs. Its MIT copyright notice is retained in vendor/TapeKit-LICENSE. It is not the primary TapeBrowser upstream.

src/chain-reader.mjs and registry-abi.mjs are copied/adapted from FAB tools/deweb at base `bc24cfc9d6a7de7b17eace33f5dcca610dcb14ee` plus owned local gateway fixes of 2026-10-10. Source SHA-256 fingerprints are retained in vendor/source-sha256.json. The normal viem import replaces the original tasks/node_modules path. Same-block dual RPC agreement is retained.

FAB changes storage semantics: on-chain CID/version binding replaces chain-stored file chunks; HTTPS IPFS gateways replace tape://. This version does not fork Chromium or claim TapeKit wire compatibility.

## FAB adaptation (2026-10-10)

| Module | Upstream source | FAB behavior |
|---|---|---|
| bridge/, src/bridge-server.mjs, provider-host.mjs, electron/site-preload.cjs | src/bridge/, src/main/bridge-server.js, provider-host.js, site-preload.cjs | External extension bridge; authenticated loopback, origin grants, every write confirmed, cancellation on navigation/revoke/session changes. FAB X Layer defaults; unknown wallet methods fail closed. |
| src/settings.mjs, i18n.mjs, i18n/en.mjs | src/main/settings.js, src/i18n/ | Atomic user settings; FAB labels added; language/RPC/cache/permission UI. |
| src/local-site.mjs, precheck.mjs, safety.mjs, category.mjs, site-metadata.mjs | corresponding src/main modules, directory.js helpers | Selected-directory preview, fs.watch reload, path/symlink checks, static audit and category/card extraction. IPFS replaces file-chunk transaction estimates. |
| src/risk.mjs, abi.mjs, page-audit.mjs | corresponding src/main modules | Standard signing risk decoding and loaded-file baseline comparison. Unknown approval type is not guessed to be an NFT. |
| src/content-store.mjs, release-content.mjs, electron/release-session.mjs | content-store.js and protocol handler responsibilities | Atomic SHA cache with single-flight writes; files checked against gateway manifest; explicit historical cache is separate from live verification. No independent IPFS DAG proof. |
| src/catalog.mjs, quorum.mjs, catalog-metadata.mjs | directory.js responsibilities | Registry SitePublished events replace obsolete file-contract scanning; confirmed checkpoints, progress/cancel, saved metadata, owned circuit scan includes nextId itself. |
| electron/deep-links.mjs | main.js protocol lifecycle | FAB scheme and single instance; all OS links still pass configured app resolution. |

Tests adapted from upstream category, risk, safety and page-audit suites retain GPL obligations. Additional FAB tests cover the changed chain/storage and authorization invariants. The upstream BNB/Base formatter fixtures are pure tests, not supported FAB deployments or RPC configuration.

Official TapeOut deployment addresses, chain-stored file chunks, BEM tipping/reward economics and DomainBinding policies are intentionally not carried into FAB. The existing FAB developer center handles publication rather than duplicating its wallet-signed CID binding workflow inside Electron. These are the user's approved business adaptations, not a claim of wire compatibility with official tape:// applications.

Directory seed provenance: a live dual-RPC scan from deployment transaction `0xd7187657f38bb754774d0fcaee444b50045f4b5bb8136b5318533a59be274b36`, Registry `0xB84223d84b2b7F08927A13c9086Dc055Bf2aabDd`; confirmed checkpoint number/hash retained in src/catalog-seed.json. It is a bundled discovery cache, never a substitute for resolving an application's current or explicitly requested release on chain.

Browser compatibility follows the current FAB gateway: same-release scripts/styles only; external API, WebSocket, Worker and inline script/style are blocked. This intentionally preserves existing FAB application isolation; arbitrary upstream websites need adaptation. Container native OKB balance is read-only, without BEM/reward policy. HTTPS sharing works without installing the client; fab:// opens a configured application in the client.
