# BLACKOUT // Survival Protocol

A cinematic real-time multiplayer thriller for **2–8 players**. Players join a room by code, receive private intelligence, discuss through facility comms, make timed decisions, and survive until one remains.

## Features

- 2–8 players per room
- Room-code multiplayer with no login
- Node.js + Express + Socket.IO
- Server-authoritative timers, decisions, eliminations, and winner selection
- Private clue for every living player each round
- 14-second decision windows
- 9 incident scenarios
- Emergency override if a round would eliminate everyone
- In-game multiplayer chat
- Animated sci-fi/horror UI with scanlines, particles, glow, countdowns, result reveals, and winner screen
- Responsive mobile + desktop layout
- Sound effects using the browser Web Audio API; no audio assets required
- Render-ready configuration
- `/health` endpoint for deployment monitoring

## Run locally

Requirements: Node.js 18+

```bash
npm install
npm start
```

Open:

```text
http://localhost:3000
```

To test multiplayer locally, open the URL in multiple browser tabs/windows. For separate devices, deploy the project publicly.

## Deploy on Render

1. Create a new GitHub repository.
2. Upload this project, including `package.json`, `server.js`, and the `public` folder.
3. In Render, create a **New Web Service** and connect the GitHub repository.
4. Render will detect the Node project. Use:
   - Build Command: `npm install`
   - Start Command: `npm start`
5. Deploy.
6. Open the generated HTTPS URL on two or more devices.

`render.yaml` is included for infrastructure-as-code setups.

## Game flow

1. Create or join a room.
2. Host waits for 2–8 players.
3. Host starts the protocol.
4. Every living player receives a private clue.
5. A facility incident appears with three choices.
6. Players discuss and have 14 seconds to lock a response.
7. The server resolves the round and eliminates players who chose the unsafe response.
8. If everyone would be eliminated, an emergency override preserves one random player.
9. The process continues until one survivor remains.
10. The final survivor is displayed with the round leaderboard.

## Project structure

```text
BLACKOUT/
├── server.js
├── package.json
├── render.yaml
├── README.md
├── .gitignore
└── public/
    ├── index.html
    ├── style.css
    └── client.js
```

## Security / multiplayer notes

The server owns room state, round timers, scenario selection, private clues, decisions, and elimination results. Clients only request actions; they do not decide whether a choice is safe.

For a production-scale deployment, consider adding persistent storage, rate limiting, reconnection tokens, moderation controls, and a database-backed room/session system.
