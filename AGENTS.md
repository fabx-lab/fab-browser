# FAB Browser instructions

Independent PoD/FAB desktop browser. Read workspace AGENTS.md and git-delivery policy before edits. Source and test prereleases belong in the public cybercity001/fab-browser repository; do not import Miner release rules. Primary upstream and GPL-3.0-or-later obligations are in UPSTREAM.md.

Keep website content unprivileged: no Node or management IPC in application content. The restricted EIP-1193 preload may only use the authenticated local wallet bridge with origin approval; never expose shell controls. Ordinary HTTP/HTTPS browsing uses a separate unprivileged session; never label it chain-verified. Chain authority belongs in src/resolver.mjs and src/chain-reader.mjs; storage is IPFS via approved HTTPS gateways. Do not reintroduce official TapeOut contracts, DomainBinding fees or private-key management. X Layer 196 test configuration is real mainnet; chain resolution is read-only; signing requests require explicit website approval and external wallet confirmation.

Use Node22 and pinned pnpm lockfile. Run pnpm test, pnpm build, pnpm smoke; distinguish source distribution, desktop execution and signed install packages. Never claim IPFS DAG verification from RPC CID agreement. Keep historical failures and current runtime evidence under ignored artifacts.

## Setup

Node.js 22 (Electron requires >= 22.12) and pnpm 10.33.0, pinned by `packageManager`. On the default Cloud Agent image both are already on the login-shell PATH.

```sh
pnpm install --frozen-lockfile
node node_modules/electron/install.js
pnpm test
pnpm build
```

`pnpm install --frozen-lockfile` is idempotent. Electron 44 has no postinstall script, so `node node_modules/electron/install.js` downloads the Linux binary and exits immediately when it is already present. Run that before `pnpm start` or `pnpm smoke`.

There is no lint or typecheck script. `pnpm test` and `pnpm build` need no secrets, env vars, or local services. `pnpm build` syntax-checks sources and copies them into `dist/`; it does not produce an installer.

`pnpm smoke` needs a display and outbound HTTPS to the public X Layer RPCs and gateway hardcoded in `src/config.mjs`. No API keys. Headless DBus warnings are non-fatal. The later catalog refresh walks public X Layer logs forward from `src/catalog-seed.json` and can run for a long time; it is not required for install, test, or build. Native installers (`pnpm dist:*`, `pnpm verify:client`) stay on the manual clients workflow. pnpm ignores the `electron-winstaller` build script; that only affects Windows packaging.
