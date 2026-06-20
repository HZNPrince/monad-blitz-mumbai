# Traction contracts

Foundry package for the Traction MVP performance-payment boundary.

## Contracts

- `MockUSDC`: six-decimal test token. It is not an official Monad asset.
- `PerformanceOracle`: authorized reporters commit monotonic performance and finalize one evidence hash.
- `ConversionRegistry`: campaign owners bind an approved content hash, conversion recipient, minimum action value, and expiry; each wallet can convert once, and finalized cumulative counts feed an allowlisted oracle adapter.
- `CampaignFactory`: deploys and atomically prefunds one escrow per campaign.
- `PerformanceEscrow`: pays the base fee plus cumulative reached tiers, capped by prefunding; refunds the remainder or the full amount after expiry.
- `AgentTreasury`: receives earnings and limits each reinvestment to a configured share of its current token balance.

The package has not been deployed. Addresses must not be added to application configuration until a real Monad Testnet deployment succeeds.

## Commands

```bash
forge fmt --check
forge test -vvv
forge test --match-test testFuzzTierBoundaries
```

## Monad Testnet deployment

Official network coordinates used by the application:

- Chain ID: `10143`
- RPC: `https://testnet-rpc.monad.xyz`
- Explorer: `https://testnet.monadvision.com`

Set secrets outside the repository:

```bash
export MONAD_TESTNET_RPC_URL=https://testnet-rpc.monad.xyz
export DEPLOYER_ADDRESS=0x...
export PERFORMANCE_REPORTER_ADDRESS=0x...
export DEPLOYER_KEYSTORE=/absolute/path/to/encrypted-keystore
export DEPLOYER_PASSWORD_FILE=/absolute/path/to/password-file
```

Dry-run before broadcasting:

```bash
forge script script/DeployMonadTestnet.s.sol:DeployMonadTestnet \
  --rpc-url monad_testnet \
  --sender "$DEPLOYER_ADDRESS" \
  --keystore "$DEPLOYER_KEYSTORE" \
  --password-file "$DEPLOYER_PASSWORD_FILE"
```

Broadcast only from a funded testnet deployer after reviewing the simulation:

```bash
forge script script/DeployMonadTestnet.s.sol:DeployMonadTestnet \
  --rpc-url monad_testnet \
  --sender "$DEPLOYER_ADDRESS" \
  --keystore "$DEPLOYER_KEYSTORE" \
  --password-file "$DEPLOYER_PASSWORD_FILE" \
  --broadcast
```

The script uses Foundry's encrypted-keystore signer; it does not require a raw private key environment variable. Never commit keystores, passwords, broadcast artifacts, or inferred deployment addresses.

After deployment, the campaign owner configures its escrow in `ConversionRegistry`. A qualifying visitor calls `convert(escrow)` from their own wallet and supplies at least the campaign minimum value. The registry enforces one conversion per wallet and forwards any value to the configured product recipient. The campaign owner finalizes the registry count; an authorized oracle reporter then calls `commitFinalizedConversions`, after which anyone may settle the escrow. A wallet is not proof of a unique human, so campaigns still need economic minimums and anomaly review.
