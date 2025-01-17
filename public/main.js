const socket = io();
const output = document.getElementById('output');
const input = document.getElementById('input');
const statusIndicator = document.getElementById('status-indicator');
const inspectInput = document.getElementById('inspect-input');
const inspectButton = document.getElementById('inspect-button');
const inspectBack = document.getElementById('inspect-back');
const inspectForward = document.getElementById('inspect-forward');
const inspectorResult = document.getElementById('inspector-result');
let currentGraph = null;

// Path history tracking
let pathHistory = [];
let currentPathIndex = -1;

function updateNavigationButtons() {
    inspectBack.disabled = currentPathIndex <= 0;
    inspectForward.disabled = currentPathIndex >= pathHistory.length - 1;
}

function navigateToPath(path, addToHistory = true) {
    if (addToHistory) {
        // Remove any forward history when adding a new path
        if (currentPathIndex < pathHistory.length - 1) {
            pathHistory = pathHistory.slice(0, currentPathIndex + 1);
        }
        pathHistory.push(path);
        currentPathIndex = pathHistory.length - 1;
    }
    
    inspectInput.value = path;
    updateNavigationButtons();
    
    socket.emit('execute', {
        type: 'inspect',
        expression: path
    });
}

// Handle navigation button clicks
inspectBack.addEventListener('click', () => {
    if (currentPathIndex > 0) {
        currentPathIndex--;
        navigateToPath(pathHistory[currentPathIndex], false);
    }
});

inspectForward.addEventListener('click', () => {
    if (currentPathIndex < pathHistory.length - 1) {
        currentPathIndex++;
        navigateToPath(pathHistory[currentPathIndex], false);
    }
});

// Handle main inspect input
function inspectExpression() {
    const expression = inspectInput.value.trim();
    if (expression) {
        // Reset history when manually entering a new path
        pathHistory = [expression];
        currentPathIndex = 0;
        updateNavigationButtons();
        
        socket.emit('execute', {
            type: 'inspect',
            expression: expression
        });
    }
}

inspectInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        inspectExpression();
    }
});

inspectButton.addEventListener('click', inspectExpression);

socket.on('connect', () => {
    console.log('Connected to server');
    statusIndicator.classList.add('socket-connected');
    statusIndicator.classList.remove('socket-error');
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    statusIndicator.classList.remove('socket-connected');
    statusIndicator.classList.add('socket-error');
    updateInputStates(false);
});

socket.on('pythonStatus', (connected) => {
    statusIndicator.classList.toggle('python-connected', connected);
    statusIndicator.classList.toggle('python-error', !connected);
    updateInputStates(connected);
});

function updateInputStates(enabled) {
    input.disabled = !enabled;
    inspectInput.disabled = !enabled;
    input.placeholder = enabled 
        ? "Enter Python code here. Press Shift+Enter to execute, or leave an empty line to execute a block."
        : "Waiting for Python connection...";
}

function addOutputLine(text, type = 'output') {
    const line = document.createElement('div');
    line.className = `output-line ${type}`;
    line.textContent = text;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
}

input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        if (e.shiftKey) {
            e.preventDefault();
            const code = input.value.trim();
            if (code) {
                addOutputLine(code, 'command');
                socket.emit('execute', {
                    type: 'repl',
                    code: code
                });
                input.value = '';
                codeBuffer = [];
            }
        } else if (input.value.trim() === '') {
            e.preventDefault();
            if (codeBuffer.length > 0) {
                const code = codeBuffer.join('\n');
                addOutputLine(code, 'command');
                socket.emit('execute', {
                    type: 'repl',
                    code: code
                });
                input.value = '';
                codeBuffer = [];
            }
        }
    }
});

socket.on('output', (data) => {
    addOutputLine(data);
});

socket.on('error', (data) => {
    addOutputLine(data, 'error');
});

socket.on('success', (data) => {
    addOutputLine(data.message, 'success');
});

socket.on('inspect_result', (result) => {
    console.log('Received inspect result:', result);
    if (result.data) {
        const container = document.getElementById('tree-container');
        if (!container) {
            console.error('Tree container not found');
            return;
        }
        const path = inspectInput.value.trim();
        console.log('Creating tree for path:', path);
        createTree(result.data, container, path);
    } else {
        console.error('Invalid inspect result:', result);
    }
});

// Tab handling
document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => {
        // Remove active class from all tabs
        document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        // Add active class to clicked tab
        button.classList.add('active');
        const tabId = button.dataset.tab;
        const tabContent = document.getElementById(`${tabId}-tab`);
        if (tabContent) {
            tabContent.classList.add('active');
        } else {
            console.error(`Tab content not found: ${tabId}-tab`);
        }
    });
});

function createMetadataHeader(data) {
    const header = document.createElement('div');
    header.className = 'object-metadata';

    // Create header with type and category
    const headerTop = document.createElement('div');
    headerTop.className = 'object-metadata-header';
    
    const typeSpan = document.createElement('span');
    typeSpan.className = `object-metadata-type ${data.category}`;
    typeSpan.textContent = `${data.type} (${data.category})`;
    headerTop.appendChild(typeSpan);
    
    header.appendChild(headerTop);

    // Add documentation if available
    if (data.doc) {
        const docDiv = document.createElement('div');
        docDiv.className = 'object-metadata-doc';
        docDiv.textContent = data.doc;
        header.appendChild(docDiv);
    }

    // Add metadata details
    if (data.metadata) {
        const detailsDiv = document.createElement('div');
        detailsDiv.className = 'object-metadata-details';
        
        for (const [key, value] of Object.entries(data.metadata)) {
            if (value !== null && value !== undefined) {
                const item = document.createElement('div');
                item.className = 'metadata-item';
                
                const label = document.createElement('div');
                label.className = 'metadata-item-label';
                label.textContent = key.replace(/_/g, ' ').toUpperCase();
                
                const valueDiv = document.createElement('div');
                valueDiv.className = 'metadata-item-value';
                valueDiv.textContent = Array.isArray(value) ? value.join(', ') : value;
                
                item.appendChild(label);
                item.appendChild(valueDiv);
                detailsDiv.appendChild(item);
            }
        }
        
        header.appendChild(detailsDiv);
    }

    return header;
}

function createMethodDetails(info) {
    const details = document.createElement('div');
    details.className = 'method-details';

    // Add decorators if present
    if (info.decorators && info.decorators.length > 0) {
        const decoratorsDiv = document.createElement('div');
        decoratorsDiv.className = 'method-decorators';
        info.decorators.forEach(decorator => {
            const badge = document.createElement('span');
            badge.className = 'decorator-badge';
            badge.textContent = decorator;
            decoratorsDiv.appendChild(badge);
        });
        details.appendChild(decoratorsDiv);
    }

    // Add signature
    if (info.signature) {
        const signatureDiv = document.createElement('div');
        signatureDiv.className = 'method-signature';
        signatureDiv.textContent = info.signature;
        details.appendChild(signatureDiv);
    }

    // Add metadata
    const metadataDiv = document.createElement('div');
    metadataDiv.className = 'method-metadata';

    if (info.return_type) {
        const returnType = document.createElement('span');
        returnType.className = 'method-metadata-item';
        returnType.textContent = `Returns: ${info.return_type}`;
        metadataDiv.appendChild(returnType);
    }

    if (info.is_async) {
        const asyncBadge = document.createElement('span');
        asyncBadge.className = 'method-metadata-item async';
        asyncBadge.textContent = 'async';
        metadataDiv.appendChild(asyncBadge);
    }

    if (info.is_generator) {
        const generatorBadge = document.createElement('span');
        generatorBadge.className = 'method-metadata-item generator';
        generatorBadge.textContent = 'generator';
        metadataDiv.appendChild(generatorBadge);
    }

    if (info.is_property) {
        const propertyBadge = document.createElement('span');
        propertyBadge.className = 'method-metadata-item property';
        propertyBadge.textContent = 'property';
        metadataDiv.appendChild(propertyBadge);
    }

    if (metadataDiv.children.length > 0) {
        details.appendChild(metadataDiv);
    }

    // Add documentation
    if (info.doc && info.doc !== "No documentation available") {
        const docDiv = document.createElement('div');
        docDiv.className = 'method-doc';
        docDiv.textContent = info.doc;
        details.appendChild(docDiv);
    }

    // Add source code if available
    if (info.source) {
        const sourceDiv = document.createElement('div');
        sourceDiv.className = 'method-source';
        sourceDiv.textContent = info.source;
        details.appendChild(sourceDiv);
    }

    return details;
}

function shouldUseBracketNotation(path, name) {
    // Use bracket notation for:
    // 1. Direct sys.modules access
    // 2. Direct globals() access
    // 3. When the key contains characters that make it invalid as a JS identifier
    return (path === 'sys.modules' || path === 'globals()') || !(/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name));
}

function createTreeNode(name, info, path = '', parentIsDict = false) {
    const node = document.createElement('div');
    node.className = 'tree-node';
    node.dataset.path = path;

    const header = document.createElement('div');
    header.className = 'tree-node-header';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'tree-node-name';
    nameSpan.textContent = name;

    const typeSpan = document.createElement('span');
    typeSpan.className = `tree-node-type ${info.category || info.type.toLowerCase()}`;
    typeSpan.textContent = info.type;

    // Add method type badge if it's a method
    if (info.type === 'method' && info.method_type) {
        const methodBadge = document.createElement('span');
        methodBadge.className = `method-badge ${info.method_type} ${info.is_runnable ? 'runnable' : 'not-runnable'}`;
        methodBadge.textContent = info.method_type;
        
        if (info.is_runnable) {
            const runButton = document.createElement('span');
            runButton.className = 'run-button';
            runButton.textContent = '⚡';
            runButton.onclick = (e) => {
                e.stopPropagation();
                
                let fullPath;
                if (parentIsDict && shouldUseBracketNotation(path, name)) {
                    fullPath = `${path}['${name}']`;
                } else {
                    fullPath = path ? `${path}.${name}` : name;
                }
                
                // Generate call string with parameter names if available
                let callStr = fullPath;
                if (info.signature && info.signature !== "Signature unavailable") {
                    try {
                        // Extract parameters from signature string
                        const match = info.signature.match(/\((.*?)\)/);
                        if (match) {
                            const params = match[1].split(',')
                                .map(p => p.trim())
                                .filter(p => p && !p.startsWith('*'))  // Filter out empty and *args/**kwargs
                                .map(p => {
                                    const [name] = p.split(':');  // Handle type hints
                                    const [paramName] = name.split('=');  // Handle default values
                                    return paramName.trim();
                                })
                                .join(', ');
                            callStr += `(${params})`;
                        } else {
                            callStr += '()';
                        }
                    } catch (e) {
                        console.error('Error parsing signature:', e);
                        callStr += '()';
                    }
                } else {
                    callStr += '()';
                }
                
                console.log('Generated call string:', callStr);
                
                // Switch to REPL tab and set input
                document.querySelector('[data-tab="repl"]').click();
                const input = document.getElementById('input');
                input.value = callStr;
                input.focus();
            };
            methodBadge.appendChild(runButton);
        }
        
        header.appendChild(methodBadge);
    }

    const inspectButton = document.createElement('button');
    inspectButton.className = 'tree-node-inspect';
    inspectButton.textContent = 'Inspect';
    inspectButton.onclick = (e) => {
        e.stopPropagation();
        let fullPath;
        if (parentIsDict && shouldUseBracketNotation(path, name)) {
            fullPath = `${path}['${name}']`;
        } else {
            fullPath = path ? `${path}.${name}` : name;
        }
        console.log('Inspecting path:', fullPath);
        navigateToPath(fullPath);
    };

    header.appendChild(nameSpan);
    header.appendChild(typeSpan);
    header.appendChild(inspectButton);

    const detailsDiv = document.createElement('div');
    detailsDiv.className = 'tree-node-details';
    
    if (info.type === 'method') {
        detailsDiv.appendChild(createMethodDetails(info));
    } else if (info.category === 'sequence' && info.metadata) {
        detailsDiv.innerHTML = `${info.value}\n<div class="sequence-info">Length: ${info.metadata.length || 'unknown'}, Element Types: ${info.metadata.element_types?.join(', ') || 'unknown'}</div>`;
    } else if (info.category === 'dictionary' && info.metadata) {
        detailsDiv.innerHTML = `${info.value}\n<div class="dictionary-info">Length: ${info.metadata.length || 'unknown'}, Key Types: ${info.metadata.key_types?.join(', ') || 'unknown'}, Value Types: ${info.metadata.value_types?.join(', ') || 'unknown'}</div>`;
    } else if (info.type === 'error') {
        detailsDiv.innerHTML = `<div class="error-details">${info.error_type}: ${info.error}</div>`;
    } else {
        detailsDiv.textContent = info.value || '';
    }

    node.appendChild(header);
    node.appendChild(detailsDiv);

    return node;
}

function createTree(data, container, parentPath = '') {
    console.log('Creating tree with data:', data);
    container.innerHTML = '';
    
    // Add metadata header
    container.appendChild(createMetadataHeader(data));
    
    const isDict = data.category === 'dictionary' || parentPath.includes('sys.modules');
    console.log('Is dictionary:', isDict, 'Parent path:', parentPath);
    
    // Create tree structure
    const rootNode = document.createElement('div');
    rootNode.className = 'tree-root';
    
    // Add methods
    if (data.methods && Object.keys(data.methods).length > 0) {
        console.log('Adding methods:', Object.keys(data.methods));
        const methodsSection = document.createElement('div');
        methodsSection.className = 'tree-section';
        
        Object.entries(data.methods).forEach(([name, info]) => {
            const node = createTreeNode(name, info, parentPath, isDict);
            methodsSection.appendChild(node);
        });
        
        rootNode.appendChild(methodsSection);
    }

    // Add attributes
    if (data.attributes && Object.keys(data.attributes).length > 0) {
        console.log('Adding attributes:', Object.keys(data.attributes));
        const attributesSection = document.createElement('div');
        attributesSection.className = 'tree-section';
        
        if (parentPath === 'sys.modules') {
            // Group modules by their top-level package
            const moduleGroups = {};
            
            Object.entries(data.attributes).forEach(([name, info]) => {
                const topLevel = name.split('.')[0];
                if (!moduleGroups[topLevel]) {
                    moduleGroups[topLevel] = [];
                }
                moduleGroups[topLevel].push([name, info]);
            });
            
            Object.entries(moduleGroups).sort().forEach(([topLevel, modules]) => {
                // Only show the top-level module
                const [name, info] = modules.find(([n]) => n === topLevel) || modules[0];
                const node = createTreeNode(name, info, parentPath, isDict);
                attributesSection.appendChild(node);
            });
        } else {
            Object.entries(data.attributes).forEach(([name, info]) => {
                const node = createTreeNode(name, info, parentPath, isDict);
                attributesSection.appendChild(node);
            });
        }
        
        rootNode.appendChild(attributesSection);
    }

    container.appendChild(rootNode);
}

input.addEventListener('input', () => {
    const lines = input.value.split('\n');
    codeBuffer = lines.filter(line => line.trim() !== '');
});

// Add modules shortcut handler
document.getElementById('modules-shortcut').addEventListener('click', () => {
    inspectInput.value = 'sys.modules';
    inspectExpression();
});
