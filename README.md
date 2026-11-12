# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
# Multiplayer room server

The game uses a small Node HTTP relay for room membership, ready checks, the shared mission seed, and task completion broadcasts.

To host a session on your local network, start the room server with `npm run multiplayer` and the game with `npm run dev:lan` in two terminals. The host opens the game using the LAN URL printed by Vite and creates the room. Other players on the same Wi-Fi open that same game URL on their devices, then enter the six-digit room code. The code identifies the room; the game URL points everyone to the host's server.

Allow Node through the host computer's firewall for private networks if other devices cannot connect. Players must be on the same local network. On browsers with Local Network Access support, the browser may ask each player to allow the connection to the host. This setup does not provide internet hosting. Room state is held in memory, so restarting the process clears active rooms.
