# Upstream and adaptation record

Primary user-specified upstream: https://github.com/trytotapeout/TapeBrowser
Pinned commit: `5f1d82cc2f43338477a9f8a8d04ba2d218b7b85f` (TapeBrowser 0.13.0).
License: **GPL-3.0-or-later** according to upstream package.json; complete GPLv3 text retained in LICENSE and vendor/TapeBrowser-LICENSE. Distribution of this derivative must retain applicable source/license obligations.

An earlier investigation incorrectly limited lookup to the TapeOutProtocol account. That account lookup does not establish absence of TapeBrowser. The user supplied the actual repository and this adaptation now uses that source.

| FAB module | TapeBrowser source reference | Adaptation |
|---|---|---|
| src/library.mjs | src/main/library.js | Atomic local library persistence, per-application history deduplication and bookmarks; canonical FAB container identity replaces tape scheme names. |
| src/navigation.mjs | src/main/address.js and tabs.js | Input classification and origin guards reimplemented for configured FAB circuit/container/HTTPS identities, not official tape names or wallet scanning. |
| electron/main.mjs | src/main/tabs.js and main.js | WebContentsView browser content isolated from trusted shell; no application preload; stricter navigation to registered HTTPS release origins. |
| ui/ | src/ui/ui.js | Address, navigation, local library and status responsibilities adapted into a small FAB interface. No claim of full upstream tab/directory/wallet feature parity. |

Additional protocol/design reference: TapeOutProtocol/TapeKit at commit `4c0fdfabebab83a3d9d2968ebe38c833bcddab51`, especially apps/tapesend/electron/main.mjs and preload.cjs. Its MIT copyright notice is retained in vendor/TapeKit-LICENSE. It is not the primary TapeBrowser upstream.

src/chain-reader.mjs and registry-abi.mjs are copied/adapted from FAB tools/deweb at base `bc24cfc9d6a7de7b17eace33f5dcca610dcb14ee` plus owned local gateway fixes of 2026-10-10. Source SHA-256 fingerprints are retained in vendor/source-sha256.json. The normal viem import replaces the original tasks/node_modules path. Same-block dual RPC agreement is retained.

FAB changes storage semantics: on-chain CID/version binding replaces chain-stored file chunks; HTTPS IPFS gateway replaces tape://. Official TapeOut deployments, DomainBinding fee policy, wallet bridge, private-key management, message/asset features and offline unverified fallback are excluded. This version does not fork Chromium or claim TapeKit protocol compliance.
