# Message Ding - SillyTavern Cross-Client Notifier - server plugin

Server plugin to notify connectend clients about new replies on other clients. Perfect for situations where multiple people are participating in the same chat from different devices.

## Features

- Notifies other connected clients when a bot message is received
- Low server overhead (WebSocket-based)

## Installation (server plugin)

Clone the repository into your SillyTavern plugins directory:

```bash
git clone https://github.com/cha1latte/sillytavern-notifier-server
cd sillytavern-notifier-server
npm install
```

Then restart SillyTavern.

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                     SillyTavern Server                          │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Server Plugin (WebSocket relay on port 5050)             │  │
│  │  - Tracks connected clients                               │  │
│  │  - Broadcasts events to OTHER clients only                │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ WebSocket
                ┌─────────────┴─────────────┐
                │                           │
     ┌──────────▼──────────┐     ┌──────────▼──────────┐
     │  Client A           │     │   Client B          │
     │  (triggers message) │     │   (receives notif)  │
     └─────────────────────┘     └─────────────────────┘
```

1. Client A sends a message, bot responds
2. Client A's extension detects `CHARACTER_MESSAGE_RENDERED` event
3. Client A sends notification to server
4. Server broadcasts to all OTHER clients (not A)
5. Client B receives notification, plays sound + shows desktop notification

## Configuration

The WebSocket server runs on port `5050` by default. To change this, set the environment variable:

```bash
MESSAGE_DING_PORT=5051 node server.js
```

## Extending

To add support for additional events (like user messages), edit:

1. `server-plugin/index.js` - Add event type to `EVENT_TYPES`
2. `index.js` (UI extension) - Add event listener and handling

User message notifications are already stubbed out in the code - just uncomment to enable.

## Requirements

- SillyTavern with server plugin support
- Modern browser with Notification API support
- Clients must be able to reach the WebSocket port (5050)

## Author

cha1latte
