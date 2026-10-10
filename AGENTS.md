# FAB Browser instructions

Independent PoD/FAB desktop browser. Read workspace AGENTS.md and git-delivery policy before edits. Source and test prereleases belong in the private cybercity001/fab-browser repository; do not import Miner release rules. Primary upstream and GPL-3.0-or-later obligations are in UPSTREAM.md.

Keep website content unprivileged: no Node/preload/IPC/permission bridge in the application view. Chain authority belongs in src/resolver.mjs and src/chain-reader.mjs; storage is IPFS via approved HTTPS gateways. Do not reintroduce official TapeOut contracts, DomainBinding fees or private-key management. X Layer 196 test configuration is real mainnet; this browser is read-only.

Use Node22 and pinned pnpm lockfile. Run pnpm test, pnpm build, pnpm smoke; distinguish source distribution, desktop execution and signed install packages. Never claim IPFS DAG verification from RPC CID agreement. Keep historical failures and current runtime evidence under ignored artifacts.
