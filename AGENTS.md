# FAB Browser instructions

Independent PoD/FAB desktop browser. Read workspace AGENTS.md and git-delivery policy before edits. Source and test prereleases belong in the public cybercity001/fab-browser repository; do not import Miner release rules. Primary upstream and GPL-3.0-or-later obligations are in UPSTREAM.md.

Keep website content unprivileged: no Node or management IPC in application content. The restricted EIP-1193 preload may only reach the wallet (built-in, or the authenticated extension bridge) with origin approval; never expose shell controls. Ordinary HTTP/HTTPS browsing uses a separate unprivileged session; never label it chain-verified. Chain authority belongs in src/resolver.mjs and src/chain-reader.mjs; storage is IPFS via approved HTTPS gateways. Do not reintroduce official TapeOut contracts or DomainBinding fees. X Layer 196 test configuration is real mainnet; chain resolution is read-only; signing requests require explicit website approval.

Use Node22 and pinned pnpm lockfile. Run pnpm test, pnpm build, pnpm smoke; distinguish source distribution, desktop execution and signed install packages. Never claim IPFS DAG verification from RPC CID agreement. Keep historical failures and current runtime evidence under ignored artifacts.

## UI/UX

- Search-style and quiet: few words, short labels, one clear primary action per view. No paragraphs in panels.
- Colours only from the token pairs at the top of ui/style.css: greys, plus safe / unsafe / danger. Never colour an ordinary page or a cache as chain-verified.
- Every visible string goes through src/i18n/en.mjs.
- Check light, dark and the 1280 / 800 / 390 widths; keep the smoke's welcome, layout, wallet and appearance checks passing.

## Wallet

Built-in wallet in src/local-wallet.mjs: one account, scrypt + AES-GCM in userData (0600), plaintext only in main-process memory while unlocked. Secrets cross IPC only from the shell, never from site content. Every site connection and signature still needs FAB approval.
