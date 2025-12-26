const { WebSocketServer } = require('ws');
const crypto = require('crypto');

// Plugin info - required by SillyTavern
const info = {
    id: 'message-ding-relay',
    name: 'Message Ding Relay',
    description: 'WebSocket relay for cross-client message notifications',
};

// Configuration
const DEFAULT_PORT = 5050;
let wsServer = null;
const clients = new Map(); // clientId -> WebSocket

// Event types that can be broadcast (easily extensible)
const EVENT_TYPES = {
    CHARACTER_MESSAGE: 'character_message',
    USER_MESSAGE: 'user_message',
    // Add more event types here as needed
};

/**
 * Generate a unique client ID
 */
function generateClientId() {
    return crypto.randomBytes(8).toString('hex');
}

/**
 * Broadcast a message to all clients except the sender
 * @param {string} senderId - The client ID of the sender
 * @param {object} message - The message to broadcast
 */
function broadcastToOthers(senderId, message) {
    const payload = JSON.stringify(message);

    clients.forEach((ws, clientId) => {
        if (clientId !== senderId && ws.readyState === ws.OPEN) {
            ws.send(payload);
        }
    });
}

/**
 * Handle incoming WebSocket messages
 * @param {WebSocket} ws - The WebSocket connection
 * @param {string} clientId - The client's unique ID
 * @param {Buffer} data - The raw message data
 */
function handleMessage(ws, clientId, data) {
    try {
        const message = JSON.parse(data.toString());

        // Validate message structure
        if (!message.type) {
            ws.send(JSON.stringify({ type: 'error', message: 'Missing message type' }));
            return;
        }

        switch (message.type) {
            case 'notify':
                // Broadcast notification to other clients
                if (message.event && Object.values(EVENT_TYPES).includes(message.event)) {
                    console.log(`[message-ding-relay] Broadcasting ${message.event} from ${clientId}`);
                    broadcastToOthers(clientId, {
                        type: 'notification',
                        event: message.event,
                        timestamp: Date.now(),
                        data: message.data || {},
                    });
                }
                break;

            case 'ping':
                ws.send(JSON.stringify({ type: 'pong' }));
                break;

            default:
                console.log(`[message-ding-relay] Unknown message type: ${message.type}`);
        }
    } catch (error) {
        console.error('[message-ding-relay] Error parsing message:', error);
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
    }
}

/**
 * Handle new WebSocket connections
 * @param {WebSocket} ws - The new WebSocket connection
 */
function handleConnection(ws) {
    const clientId = generateClientId();
    clients.set(clientId, ws);

    console.log(`[message-ding-relay] Client connected: ${clientId} (${clients.size} total)`);

    // Send welcome message with client ID
    ws.send(JSON.stringify({
        type: 'welcome',
        clientId: clientId,
        supportedEvents: Object.values(EVENT_TYPES),
    }));

    // Handle messages
    ws.on('message', (data) => handleMessage(ws, clientId, data));

    // Handle disconnection
    ws.on('close', () => {
        clients.delete(clientId);
        console.log(`[message-ding-relay] Client disconnected: ${clientId} (${clients.size} remaining)`);
    });

    // Handle errors
    ws.on('error', (error) => {
        console.error(`[message-ding-relay] Client ${clientId} error:`, error);
        clients.delete(clientId);
    });
}

/**
 * Initialize the WebSocket server
 * @param {number} port - Port to listen on
 */
function initWebSocketServer(port) {
    if (wsServer) {
        wsServer.close();
    }

    wsServer = new WebSocketServer({ port });

    wsServer.on('listening', () => {
        console.log(`[message-ding-relay] WebSocket server listening on port ${port}`);
    });

    wsServer.on('connection', handleConnection);

    wsServer.on('error', (error) => {
        console.error('[message-ding-relay] Server error:', error);
    });
}

/**
 * Plugin initialization - called by SillyTavern
 * @param {Router} router - Express router for API endpoints
 */
async function init(router) {
    console.log('[message-ding-relay] Initializing plugin...');

    // Start WebSocket server
    const port = process.env.MESSAGE_DING_PORT || DEFAULT_PORT;
    initWebSocketServer(port);

    // API endpoint to get server info
    router.get('/info', (req, res) => {
        res.json({
            port: port,
            connectedClients: clients.size,
            supportedEvents: Object.values(EVENT_TYPES),
        });
    });

    // API endpoint to get WebSocket port (for UI extension)
    router.get('/port', (req, res) => {
        res.json({ port: port });
    });

    console.log('[message-ding-relay] Plugin initialized successfully');
}

/**
 * Plugin cleanup - called when SillyTavern shuts down
 */
async function exit() {
    console.log('[message-ding-relay] Shutting down...');

    if (wsServer) {
        // Close all client connections
        clients.forEach((ws) => {
            ws.close(1000, 'Server shutting down');
        });
        clients.clear();

        // Close the server
        wsServer.close();
        wsServer = null;
    }

    console.log('[message-ding-relay] Shutdown complete');
}

module.exports = {
    info,
    init,
    exit,
};
