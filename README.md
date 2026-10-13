<p align="center">
  <img src="assets/flicko-pfp-400.jpg" alt="Flicko logo" width="120" />
</p>

<h1 align="center">Flicko 📸</h1>

<p align="center">
    <strong>Snap it. Caption it. Trade it.</strong>
    <br />
    A camera-first meme market for Solana Seeker. Every photo can become a tradable coin, priced in SKR.
    <br /> <br />
    <a href="https://github.com/Dev050x/Flicko/releases/latest/download/flicko.apk"><strong>Download APK</strong></a> ·
    <a href="https://drive.google.com/file/d/1p1wARJwYyuSamHRFxd-0dnHD6vXH942z/view"><strong>Pitch Deck</strong></a> ·
    <a href="https://getflicko.tech"><strong>Website</strong></a>
    <br /> <br />
    <a href="#introduction"><strong>Introduction</strong></a> ·
    <a href="#features"><strong>Features</strong></a> ·
    <a href="#skr-integration"><strong>SKR Integration</strong></a> ·
    <a href="#on-chain-program"><strong>On-chain Program</strong></a> ·
    <a href="#tech-stack"><strong>Tech Stack</strong></a> ·
    <a href="#repo-structure"><strong>Repo Structure</strong></a> ·
    <a href="#try-it"><strong>Try It</strong></a> ·
    <a href="#local-development"><strong>Local Development</strong></a> ·
    <a href="#roadmap"><strong>Roadmap</strong></a> ·
    <a href="#license"><strong>License</strong></a>
</p>
<p align="center">
  <a href="https://x.com/flicko_app">
    <img src="https://img.shields.io/twitter/follow/flicko_app?style=flat&label=%40flicko_app&logo=twitter&color=0bf&logoColor=000" alt="Flicko on X" />
  </a>
  <a href="https://x.com/Div5533">
    <img src="https://img.shields.io/twitter/follow/Div5533?style=flat&label=%40Div5533&logo=twitter&color=0bf&logoColor=000" alt="Div on X" />
  </a>
</p>

## Introduction

Flicko is a native Android app built for the Solana Seeker. You take a photo inside the app, dress it up with face-tracked crypto filters, pick one of three AI-written captions, and launch it as a real SPL token in one tap. Every meme is priced and traded in SKR, starts on a bonding curve, and graduates automatically into a locked liquidity pool, so it stays tradable forever. Creators earn 2% of every trade on their memes.

## Features

- 📸 **Camera-first** - Memes start in the camera, not the gallery. Live face-tracked filters (Rug Pull, Degen Mode, AI Agent, Neon Goggles, Laser Eyes and more), including 3D ones.
- 🤖 **AI captions** - A vision model suggests three meme captions for every photo; write your own if none fit.
- 🎨 **Photo editor** - Crop, adjust, text, stickers, drawing and filters, rendered with Skia so the preview matches the minted image exactly.
- 🚀 **One-tap launch** - Choose supply and starting price, approve once in your wallet, and the meme is a live coin.
- 📈 **Live markets** - Trending, new and top-gainer lists, price charts, holders and trades for every meme.
- 🎞️ **Swipe feed** - Full-screen feed of memes you can like and buy from directly.
- 💰 **Creator earnings** - Creators earn 2% of every trade, forever, and claim it from their profile.
- 🔐 **Sign In With Solana** - Connect and sign in with one wallet approval over Mobile Wallet Adapter.
- 🔔 **Push alerts** - New buyers on your meme, graduations, and holdings up +50% / 2x / 5x / 10x.
- 🔗 **Share links** - `getflicko.tech/m/<mint>` links open straight into the app.

## SKR Integration

- 🪙 **Priced in SKR** - Every meme is bought and sold with SKR on its bonding curve and pool.
- 🔥 **Burns** - 0.5% of every trade is burned. Premium filters are unlocked by burning SKR, and the program supports a creation fee that is burned (set to 0 on devnet).
- 💸 **Creator fees in SKR** - The 2% creator fee accrues in SKR and is claimed on-chain.
- 🎁 **Welcome airdrop** - New wallets receive 10,000 test SKR on their first sign-in.
- 🧪 **Devnet SKR** - SKR only exists on mainnet, so devnet uses a test SKR mint: `2s9jDvT4hdK1ajJZ4xhAhk6aRxbTdgPdmr55mcgcSFUB`

## On-chain Program

Anchor program `4BfMnkmQheerNffcJtEusXxVC16uhGExrRevBLUcZgBD` on devnet ([explorer](https://explorer.solana.com/address/4BfMnkmQheerNffcJtEusXxVC16uhGExrRevBLUcZgBD?cluster=devnet)), deployed from a verifiable build.

- **Token** - Each meme is a Token-2022 mint with on-chain metadata. The full supply is minted to the program's vault and the mint authority is revoked.
- **Launch phase** - 80% of the supply sells on a bonding curve with virtual reserves.
- **Graduation** - The buy that sells out the curve moves the raised SKR and the remaining 20% of tokens into an `x * y = k` pool with no price jump. Liquidity is locked in the program forever.
- **Fees** - 2% to the creator and 0.5% burned on every trade, both in SKR. All math is `u128` with rounding in the pool's favour, mirrored exactly in the TypeScript SDK.
- **Attestation** - `create_meme` requires an Ed25519 signature from the Flicko server, so every on-chain meme went through the app.
- **Instructions** - `create_meme`, `buy`, `sell`, `claim_creator_fees`, plus admin `initialize_config`, `update_config` and `set_attestor`.
- **Events** - `MemeCreated`, `Trade`, `Graduated` and `CreatorFeesClaimed`, consumed by the indexer.

## Tech Stack

- [Anchor](https://www.anchor-lang.com/) - Solana program framework (Rust).
- [Expo](https://expo.dev/) / [React Native](https://reactnative.dev/) - Native Android app, with OTA updates through EAS.
- [Mobile Wallet Adapter](https://docs.solanamobile.com/) - Sign In With Solana and transaction signing with any MWA wallet, including Seed Vault Wallet on Seeker.
- [VisionCamera](https://react-native-vision-camera.com/) + [Skia](https://shopify.github.io/react-native-skia/) - Camera, live filters and the photo renderer.
- [MediaPipe](https://ai.google.dev/edge/mediapipe) & [ML Kit](https://developers.google.com/ml-kit) - On-device face tracking, in custom Kotlin modules.
- [Filament](https://github.com/margelo/react-native-filament) - 3D face filters.
- [Bun](https://bun.sh/) + [Express](https://expressjs.com/) - API server.
- [PostgreSQL](https://www.postgresql.org/) + [Drizzle ORM](https://orm.drizzle.team/) - Memes, trades, positions and candles.
- [Upstash Redis](https://upstash.com/) - Sign-in nonces.
- [Helius](https://www.helius.dev/) - Devnet RPC and WebSocket feed for the indexer.
- [Turborepo](https://turbo.build/) - Monorepo for the app, server and SDK.

## Repo Structure

```
flicko_programs/        Anchor program (Rust)
flicko_app/
  apps/mobile           Android app (Expo)
  apps/server           API, indexer, push notifier
  packages/sdk          @flicko/sdk: IDL, PDAs, curve math, instruction builders
  config/devnet.json    Program ID, SKR mint and other devnet addresses
```

## Try It

1. Install the [APK](https://github.com/Dev050x/Flicko/releases/latest/download/flicko.apk) on an Android phone.
2. Switch your wallet to devnet:
   - **Solflare** - Settings → Network → Devnet
   - **Phantom** - Settings → Developer Settings → Testnet Mode → Solana Devnet
3. Get devnet SOL from [faucet.solana.com](https://faucet.solana.com) for network fees.
4. Connect your wallet in Flicko. New wallets get 10,000 test SKR automatically.

## Local Development

```bash
git clone https://github.com/Dev050x/Flicko.git
cd Flicko

# program
cd flicko_programs
anchor build
anchor test

# apps
cd ../flicko_app
bun install
bun run sync-idl

# server (copy apps/server/.env.example to apps/server/.env first)
cd apps/server && bun run dev

# mobile (dev build on a connected device)
cd ../mobile && bunx expo run:android
```

## Roadmap

- Mainnet launch on the Solana dApp Store
- More 3D filters
- Flicko Live
- Multiplayer meme battles

## License

Flicko is open-source under the [MIT License](LICENSE).
