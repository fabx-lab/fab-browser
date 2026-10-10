// ABI shared by the deployment console, publisher, gateway, and verification scripts.
export const registryAbi = [
  {
    type: "function",
    name: "site",
    stateMutability: "view",
    inputs: [{ name: "container", type: "address" }],
    outputs: [
      { name: "cid", type: "string" },
      { name: "version", type: "uint256" },
      { name: "publisher", type: "address" },
      { name: "publishedAt", type: "uint64" },
    ],
  },
  {
    type: "function",
    name: "release",
    stateMutability: "view",
    inputs: [
      { name: "container", type: "address" },
      { name: "version", type: "uint256" },
    ],
    outputs: [
      {
        name: "r",
        type: "tuple",
        components: [
          { name: "cid", type: "string" },
          { name: "publisher", type: "address" },
          { name: "publishedAt", type: "uint64" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "publish",
    stateMutability: "nonpayable",
    inputs: [
      { name: "circuits", type: "address" },
      { name: "tokenId", type: "uint256" },
      { name: "expectedVersion", type: "uint256" },
      { name: "cid", type: "string" },
    ],
    outputs: [
      { name: "container", type: "address" },
      { name: "version", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "factory",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "opener",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
];
export const validCID = (cid) =>
  /^bafybei[a-h][a-z2-7]{50}[aeimquy4]$/.test(cid);
