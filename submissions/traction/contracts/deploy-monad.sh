#!/bin/bash

# Configuration
MONAD_RPC="https://testnet-rpc.monad.xyz"
MONAD_CHAIN_ID=10143

# Contract parameters (you can customize these)
STABLECOIN_ADDRESS="${STABLECOIN_ADDRESS:-0x1234567890123456789012345678901234567890}"
ORACLE_ADDRESS="${ORACLE_ADDRESS:-0x0987654321098765432109876543210987654321}"
DEPLOYER_PK="${DEPLOYER_PRIVATE_KEY:-0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef}"

echo "🚀 Deploying to Monad Testnet..."
echo "RPC: $MONAD_RPC"
echo "Stablecoin: $STABLECOIN_ADDRESS"
echo "Oracle: $ORACLE_ADDRESS"
echo ""

# Install dependencies
if [ ! -d "lib" ]; then
  echo "📦 Installing dependencies..."
  forge install OpenZeppelin/openzeppelin-contracts
fi

# Build
echo "🔨 Building contracts..."
forge build 2>/dev/null

# Deploy (requires private key in environment)
if [ -z "$DEPLOYER_PRIVATE_KEY" ]; then
  echo "⚠️  DEPLOYER_PRIVATE_KEY not set"
  echo "Set it with: export DEPLOYER_PRIVATE_KEY=0x..."
  echo "Then run this script again"
  exit 1
fi

echo "🚀 Deploying TractionCampaignFactory..."
forge create contracts/TractionCampaignFactory.sol:TractionCampaignFactory \
  --rpc-url "$MONAD_RPC" \
  --private-key "$DEPLOYER_PK" \
  --constructor-args "$STABLECOIN_ADDRESS" "$ORACLE_ADDRESS" \
  2>&1 | tee /tmp/monad-deploy.log

# Extract contract address
CONTRACT_ADDRESS=$(grep "Deployed to:" /tmp/monad-deploy.log | awk '{print $NF}')

if [ -n "$CONTRACT_ADDRESS" ]; then
  echo ""
  echo "✅ Contract deployed successfully!"
  echo "📍 Contract Address: $CONTRACT_ADDRESS"
  echo ""
  echo "Add to .env.local:"
  echo "NEXT_PUBLIC_CAMPAIGN_FACTORY_ADDRESS=$CONTRACT_ADDRESS"
else
  echo "❌ Deployment failed"
  echo "Check the logs above for details"
fi
