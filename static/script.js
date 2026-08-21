// State management
let conversationHistory = [];
let currentService = 'chatgpt';
let sessionId = null;

// DOM Elements
const llmSelect = document.getElementById('llm-select');
const promptInput = document.getElementById('prompt-input');
const sendBtn = document.getElementById('send-btn');
const messagesDiv = document.getElementById('messages');
const newContextCheckbox = document.getElementById('new-context');
const clearChatBtn = document.getElementById('clear-chat');
const newChatBtn = document.getElementById('new-chat');
const serviceNameEl = document.getElementById('service-name');
const sessionStatusEl = document.getElementById('session-status');
const responseModeBtns = document.querySelectorAll('input[name="response-mode"]');

// Service display names
const serviceNames = {
    chatgpt: 'ChatGPT',
    gemini: 'Google Gemini',
    qwen: 'Alibaba Qwen'
};

// Event Listeners
llmSelect.addEventListener('change', (e) => {
    currentService = e.target.value;
    serviceNameEl.textContent = serviceNames[currentService];
    clearChat();
});

sendBtn.addEventListener('click', sendMessage);
promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

clearChatBtn.addEventListener('click', clearChat);
newChatBtn.addEventListener('click', startNewChat);

// Send message function
async function sendMessage() {
    const question = promptInput.value.trim();
    
    if (!question) return;
    
    // Disable input while sending
    sendBtn.disabled = true;
    sendBtn.classList.add('loading');
    promptInput.disabled = true;
    
    // Get response mode
    const responseMode = document.querySelector('input[name="response-mode"]:checked').value;
    
    try {
        // Add user message to chat
        addMessage(question, 'user');
        conversationHistory.push({ role: 'user', content: question });
        
        // Clear input
        promptInput.value = '';
        promptInput.focus();
        
        // Update status
        setStatus('loading', 'Waiting for response...');
        
        // Send request
        const endpoint = responseMode === 'stream' ? '/stream-ask' : '/ask';
        const newContext = newContextCheckbox.checked;
        
        if (responseMode === 'stream') {
            await streamResponse(endpoint, question, newContext);
        } else {
            await getStandardResponse(endpoint, question, newContext);
        }
        
        setStatus('ready', 'Ready');
    } catch (error) {
        console.error('Error:', error);
        addMessage(`Error: ${error.message}`, 'assistant');
        setStatus('error', 'Error');
    } finally {
        sendBtn.disabled = false;
        sendBtn.classList.remove('loading');
        promptInput.disabled = false;
        promptInput.focus();
    }
}

// Get standard response
async function getStandardResponse(endpoint, question, newContext) {
    const response = await fetch(`http://localhost:8000${endpoint}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
            question: question,
            newContext: newContext
        })
    });
    
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    const responseText = data.response || data.error;
    
    addMessage(responseText, 'assistant');
    conversationHistory.push({ role: 'assistant', content: responseText });
}

// Stream response
async function streamResponse(endpoint, question, newContext) {
    const response = await fetch(`http://localhost:8000${endpoint}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
            question: question,
            newContext: newContext
        })
    });
    
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    // Add empty assistant message that we'll stream into
    const messageEl = addMessage('', 'assistant');
    const contentEl = messageEl.querySelector('.message-content');
    
    let fullResponse = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    try {
        while (true) {
            const { done, value } = await reader.read();
            
            if (done) break;
            
            const text = decoder.decode(value);
            const lines = text.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    
                    if (data === '[DONE]') {
                        break;
                    }
                    
                    try {
                        const json = JSON.parse(data);
                        fullResponse = json.text;
                        contentEl.textContent = fullResponse;
                        
                        // Scroll to bottom
                        messagesDiv.scrollTop = messagesDiv.scrollHeight;
                    } catch (e) {
                        // Skip invalid JSON
                    }
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
    
    conversationHistory.push({ role: 'assistant', content: fullResponse });
}

// Add message to chat
function addMessage(content, role) {
    // Remove welcome message if it exists
    const welcomeMsg = messagesDiv.querySelector('.welcome-message');
    if (welcomeMsg) {
        welcomeMsg.remove();
    }
    
    const messageEl = document.createElement('div');
    messageEl.className = `message ${role}`;
    
    const contentEl = document.createElement('div');
    contentEl.className = 'message-content';
    contentEl.textContent = content;
    
    messageEl.appendChild(contentEl);
    messagesDiv.appendChild(messageEl);
    
    // Scroll to bottom
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    
    return messageEl;
}

// Clear chat
function clearChat() {
    messagesDiv.innerHTML = `
        <div class="welcome-message">
            <h3>Welcome to GhostGPT 👻</h3>
            <p>Select an LLM and start chatting!</p>
        </div>
    `;
    conversationHistory = [];
}

// Start new chat (with fresh context)
function startNewChat() {
    newContextCheckbox.checked = true;
    clearChat();
    promptInput.focus();
}

// Set status
function setStatus(type, message) {
    sessionStatusEl.textContent = message;
    
    if (type === 'loading') {
        sessionStatusEl.classList.add('loading');
    } else {
        sessionStatusEl.classList.remove('loading');
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    serviceNameEl.textContent = serviceNames[currentService];
    promptInput.focus();
    setStatus('ready', 'Ready');
});
