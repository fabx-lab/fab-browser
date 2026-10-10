# FAB Browser instructions

Independent PoD/FAB desktop browser. Read workspace AGENTS.md and git-delivery policy before edits. Source and test prereleases belong in the public cybercity001/fab-browser repository; do not import Miner release rules. Primary upstream and GPL-3.0-or-later obligations are in UPSTREAM.md.

Keep website content unprivileged: no Node or management IPC in application content. The restricted EIP-1193 preload may only use the authenticated local wallet bridge with origin approval; never expose shell controls. Ordinary HTTP/HTTPS browsing uses a separate unprivileged session; never label it chain-verified. Chain authority belongs in src/resolver.mjs and src/chain-reader.mjs; storage is IPFS via approved HTTPS gateways. Do not reintroduce official TapeOut contracts, DomainBinding fees or private-key management. X Layer 196 test configuration is real mainnet; chain resolution is read-only; signing requests require explicit website approval and external wallet confirmation.

Use Node22 and pinned pnpm lockfile. Run pnpm test, pnpm build, pnpm smoke; distinguish source distribution, desktop execution and signed install packages. Never claim IPFS DAG verification from RPC CID agreement. Keep historical failures and current runtime evidence under ignored artifacts.
