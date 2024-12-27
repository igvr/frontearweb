# WebShell

A web-based interface for interacting with running Python applications. This tool provides a comfortable REPL environment that allows you to inject and execute code in a running Python application's runtime.

## Features

- Real-time code execution in the target Python application
- Multi-line code support
- Syntax highlighting
- Clean, modern interface
- Non-blocking communication with the Python application

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the web server:
```bash
npm start
```

3. Connect to http://localhost:3000 in your browser

## Usage

- Type Python code in the input area
- Press Shift+Enter to execute code immediately
- For multi-line code blocks:
  1. Type each line of code
  2. Leave an empty line to execute the entire block

## Architecture

- Frontend: HTML5, CSS3, JavaScript with Socket.IO client
- Backend: Node.js with Express and Socket.IO
- Communication: TCP sockets for Python interaction

## Port Configuration

- Web Server: Port 3000
- Python Connection: Port 9999 (configurable in server.js)
