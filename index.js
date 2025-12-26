const crypto = require('crypto');

// Plugin info - required by SillyTavern
const info = {
    id: 'message-ding-relay',
    name: 'Message Ding Relay',
    description: 'SSE relay for cross-client message notifications',
};

// Track connected SSE clients: clientId -> response object
const clients = new Map();

// Event types that can be broadcast (easily extensible)
const EVENT_TYPES = {
    CHARACTER_MESSAGE: 'character_message',
    USER_MESSAGE: 'user_message',
};

/**
 * Generate a unique client ID
 */
function generateClientId() {
    return crypto.randomBytes(8).toString('hex');
}

/**
 * Send an SSE event to a specific client
 * @param {Response} res - Express response object
 * @param {string} event - Event name
 * @param {object} data - Event data
 */
function sendSSE(res, event, data) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * Broadcast an event to all clients except the sender
 * @param {string} senderId - Client ID of the sender
 * @param {string} event - Event name
 * @param {object} data - Event data
 */
function broadcastToOthers(senderId, event, data) {
    clients.forEach((res, clientId) => {
        if (clientId !== senderId) {
            try {
                sendSSE(res, event, data);
            } catch (error) {
                console.error(`[message-ding-relay] Error sending to client ${clientId}:`, error);
                clients.delete(clientId);
            }
        }
    });
}

/**
 * Plugin initialization - called by SillyTavern
 * @param {Router} router - Express router for API endpoints
 */
async function init(router) {
    console.log('[message-ding-relay] Initializing plugin...');

    // SSE endpoint - clients subscribe to receive notifications
    router.get('/events', (req, res) => {
        const clientId = generateClientId();

        // Set SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
        res.flushHeaders();

        // Register client
        clients.set(clientId, res);
        console.log(`[message-ding-relay] Client connected: ${clientId} (${clients.size} total)`);

        // Send welcome message with client ID
        sendSSE(res, 'welcome', {
            clientId: clientId,
            supportedEvents: Object.values(EVENT_TYPES),
        });

        // Handle client disconnect
        req.on('close', () => {
            clients.delete(clientId);
            console.log(`[message-ding-relay] Client disconnected: ${clientId} (${clients.size} remaining)`);
        });

        // Keep connection alive with periodic heartbeat
        const heartbeat = setInterval(() => {
            if (clients.has(clientId)) {
                sendSSE(res, 'heartbeat', { timestamp: Date.now() });
            } else {
                clearInterval(heartbeat);
            }
        }, 30000); // Every 30 seconds

        req.on('close', () => clearInterval(heartbeat));
    });

    // POST endpoint - clients send notifications here
    router.post('/notify', (req, res) => {
        const { clientId, event, data } = req.body;

        if (!clientId) {
            return res.status(400).json({ error: 'Missing clientId' });
        }

        if (!event || !Object.values(EVENT_TYPES).includes(event)) {
            return res.status(400).json({ error: 'Invalid event type' });
        }

        console.log(`[message-ding-relay] Broadcasting ${event} from ${clientId}`);

        // Broadcast to all other clients
        broadcastToOthers(clientId, 'notification', {
            event: event,
            timestamp: Date.now(),
            data: data || {},
        });

        res.json({ success: true, recipients: clients.size - 1 });
    });

    // Info endpoint
    router.get('/info', (req, res) => {
        res.json({
            connectedClients: clients.size,
            supportedEvents: Object.values(EVENT_TYPES),
        });
    });

    console.log('[message-ding-relay] Plugin initialized successfully');
}

/**
 * Plugin cleanup - called when SillyTavern shuts down
 */
async function exit() {
    console.log('[message-ding-relay] Shutting down...');

    // Close all SSE connections
    clients.forEach((res, clientId) => {
        try {
            res.end();
        } catch (e) {
            // Ignore errors on shutdown
        }
    });
    clients.clear();

    console.log('[message-ding-relay] Shutdown complete');
}

module.exports = {
    info,
    init,
    exit,
};
