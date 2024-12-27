const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const net = require('net');
const path = require('path');

const PORT = 3000;
const PYTHON_PORT = 1337;

// Serve static files
app.use(express.static('public'));

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Python connection handler
let pythonSocket = null;

// Create TCP server for Python connection
const tcpServer = net.createServer((socket) => {
    console.log('Python application connected');
    pythonSocket = socket;
    
    let buffer = '';
    socket.on('data', (data) => {
        buffer += data.toString();
        console.log(`[Python] Received data:`, data.toString());
        
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);
            
            try {
                const message = JSON.parse(line);
                console.log('[Python] Parsed message:', message);
                
                switch (message.type) {
                    case 'output':
                        io.emit('output', message.data);
                        break;
                    case 'status':
                        io.emit('pythonStatus', message.status === 'connected');
                        if (message.message) {
                            io.emit('output', message.message + '\n');
                        }
                        break;
                    case 'success':
                        io.emit('output', message.message + '\n');
                        break;
                    case 'error':
                        io.emit('output', 'Error: ' + message.error + '\n');
                        break;
                    case 'inspect_result':
                        console.log('[Python] Emitting inspect result:', message);
                        io.emit('inspect_result', message);
                        break;
                    default:
                        console.log(`[Python] Unknown message type:`, message.type);
                }
            } catch (err) {
                console.error('[Python] Failed to parse message:', line, err);
            }
        }
    });

    socket.on('close', () => {
        console.log('Python connection closed');
        pythonSocket = null;
        io.emit('pythonStatus', false);
    });

    socket.on('error', (err) => {
        console.error('Python socket error:', err);
        pythonSocket = null;
        io.emit('pythonStatus', false);
    });
});

tcpServer.listen(PYTHON_PORT, () => {
    console.log(`TCP server listening for Python connection on port ${PYTHON_PORT}`);
});

// Socket.IO connection handler
io.on('connection', (socket) => {
    console.log('Web client connected');
    
    // Send initial connection status
    socket.emit('pythonStatus', pythonSocket !== null);

    socket.on('execute', (command) => {
        console.log(`[Web] Executing command:`, command);
        if (pythonSocket) {
            try {
                pythonSocket.write(JSON.stringify(command) + '\n');
            } catch (err) {
                console.error('[Web] Failed to send command:', err);
                socket.emit('output', 'Error: Failed to send command to Python\n');
            }
        } else {
            socket.emit('output', 'Error: Not connected to Python application\n');
        }
    });

    socket.on('disconnect', () => {
        console.log('Web client disconnected');
    });
});

http.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
