export const config = Object.freeze({
  chainId: 196,
  // FAB DeWEB test FabSiteRegistry (pod-contract deployments/history/196/deweb/test/2084e2d6…).
  registry: '0x4Ab61b0CB9A92B8BfeF4c25738f5bCbA9d36D506',
  rpcs: ['https://rpc.xlayer.tech', 'https://xlayer.drpc.org'],
  developerCenter: 'https://pod-web-test.pages.dev/en/developer',
  // The FAB gateway for any published container, as dev.fabx.tech uses it.
  gatewayTemplate: 'https://r2-{container}-deweb-test.fabx.tech',
  // Bundled icons (ui/apps/*.png, from dev.fabx.tech/deweb-icons) for apps without deweb-icon.png.
  icons: {
    '0x44725474373c73411d4261efde83e4c1ad8186d4': 'gomoku',
    '0xd9f72ba8176ca64cfda991f39ae1ed035c4cc8ce': 'poker',
    '0xab69eff9919a28fa9c69eae6b0dc1ddd2ec7b878': 'sudoku',
  },
  apps: [{
    title: 'FAB 五子棋 · 测试',
    circuits: '0xe0A8D2c38BafeEA102F53095153F7a26cc82112c', tokenId: '3',
    container: '0x44725474373c73411D4261EFde83E4C1AD8186D4',
    gateway: 'https://r2-44725474373c73411d4261efde83e4c1ad8186d4-deweb-test.fabx.tech',
  }, {
    title: 'FAB 德州扑克 · 测试',
    circuits: '0xe0A8D2c38BafeEA102F53095153F7a26cc82112c', tokenId: '5',
    container: '0xD9F72ba8176Ca64cFda991F39ae1Ed035c4CC8Ce',
    gateway: 'https://r2-d9f72ba8176ca64cfda991f39ae1ed035c4cc8ce-deweb-test.fabx.tech',
  }],
});
