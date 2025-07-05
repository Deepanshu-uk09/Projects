// DOM Elements
const chatWindow = document.getElementById('chat-window');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const newChatBtn = document.getElementById('new-chat-btn');
const infoPanel = document.getElementById('info-panel');
const closePanel = document.getElementById('close-panel');
const clearChatBtn = document.querySelector('.clear-chat');
const exportChatBtn = document.querySelector('.export-chat');
const menuItems = document.querySelectorAll('.menu-item');

// State variables
let conversationHistory = [];
let isTyping = false;
let conversationId = null;

// API endpoints
const API_URL = 'http://127.0.0.1:5000/api';

document.addEventListener('DOMContentLoaded', () => {
    userInput.addEventListener('input', adjustTextareaHeight);
    
    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    sendBtn.addEventListener('click', sendMessage);
    newChatBtn.addEventListener('click', startNewChat);
    closePanel.addEventListener('click', toggleInfoPanel);
    clearChatBtn.addEventListener('click', clearChat);
    exportChatBtn.addEventListener('click', exportChat);

    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            menuItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            if (item.querySelector('span').textContent === 'Settings') {
                infoPanel.classList.add('active');
            }
        });
    });

    saveMessageToHistory({
        type: 'bot',
        text: 'Hello! I\'m MatrixAI, your advanced AI assistant. How can I help you today?',
        timestamp: new Date().toISOString()
    });
});

function sendMessage() {
    const message = userInput.value.trim();
    if (message === '' || isTyping) return;
    
    addMessageToChat('user', message);

    saveMessageToHistory({
        type: 'user',
        text: message,
        timestamp: new Date().toISOString()
    });

    userInput.value = '';
    adjustTextareaHeight();

    processUserMessage(message);
}

async function processUserMessage(message) {
    try {
        isTyping = true;

        const response = await fetch(`${API_URL}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: message,
                conversation_id: conversationId,
                user_id: 'guest'
            })
        });

        if (!response.ok || !response.body) {
            throw new Error(`Server error: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let aiMessage = '';

        const botMessageDiv = document.createElement('div');
        botMessageDiv.className = 'message bot-message';

        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'message-avatar';
        const icon = document.createElement('i');
        icon.className = 'fas fa-robot';
        avatarDiv.appendChild(icon);

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        const textDiv = document.createElement('div');
        textDiv.className = 'message-text';
        const p = document.createElement('p');
        textDiv.appendChild(p);

        const timeDiv = document.createElement('div');
        timeDiv.className = 'message-time';
        timeDiv.textContent = getTimeString();

        contentDiv.appendChild(textDiv);
        contentDiv.appendChild(timeDiv);
        botMessageDiv.appendChild(avatarDiv);
        botMessageDiv.appendChild(contentDiv);
        chatWindow.appendChild(botMessageDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            for (let line of lines) {
                if (line.startsWith('data: ')) {
                    const token = line.replace('data: ', '').trim();
                    if (token) {
                        aiMessage += token;
                        p.textContent += token;
                        chatWindow.scrollTop = chatWindow.scrollHeight;
                    }
                }
            }
        }

        conversationId = conversationId || 'stream';

        saveMessageToHistory({
            type: 'bot',
            text: aiMessage,
            timestamp: new Date().toISOString()
        });

        isTyping = false;
    } catch (error) {
        console.error('Error processing message:', error);
        addMessageToChat('bot', 'Sorry, I encountered an error processing your request.');
        isTyping = false;
    }
}

function addMessageToChat(type, text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}-message`;

    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'message-avatar';
    const icon = document.createElement('i');
    icon.className = type === 'user' ? 'fas fa-user' : 'fas fa-robot';
    avatarDiv.appendChild(icon);

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    const textDiv = document.createElement('div');
    textDiv.className = 'message-text';

    const paragraphs = text.split('\n').filter(para => para.trim() !== '');
    paragraphs.forEach(paragraph => {
        const p = document.createElement('p');
        p.textContent = paragraph;
        textDiv.appendChild(p);
    });

    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    timeDiv.textContent = getTimeString();

    contentDiv.appendChild(textDiv);
    contentDiv.appendChild(timeDiv);
    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);
    chatWindow.appendChild(messageDiv);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

function startNewChat() {
    while (chatWindow.children.length > 1) {
        chatWindow.removeChild(chatWindow.lastChild);
    }
    conversationHistory = [conversationHistory[0]];
    conversationId = null;
}

function clearChat() {
    if (confirm('Are you sure you want to clear this chat?')) {
        startNewChat();
    }
}

function exportChat() {
    const chatContent = conversationHistory.map(msg => {
        return `[${new Date(msg.timestamp).toLocaleString()}] ${msg.type === 'user' ? 'You' : 'MatrixAI'}: ${msg.text}`;
    }).join('\n\n');

    const blob = new Blob([chatContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `MatrixAI_Chat_${new Date().toISOString().split('T')[0]}.txt`;
    a.click();

    URL.revokeObjectURL(url);
}

function toggleInfoPanel() {
    infoPanel.classList.toggle('active');
}

function saveMessageToHistory(message) {
    conversationHistory.push(message);
    localStorage.setItem(`chat_${conversationId || 'new'}`, JSON.stringify(conversationHistory));
}

function getTimeString() {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function adjustTextareaHeight() {
    userInput.style.height = 'auto';
    userInput.style.height = (userInput.scrollHeight > 120 ? 120 : userInput.scrollHeight) + 'px';
}

async function loadConversationHistory(id) {
    try {
        const response = await fetch(`${API_URL}/conversations/${id}`);
        if (!response.ok) throw new Error(`Server error: ${response.status}`);

        const data = await response.json();

        while (chatWindow.children.length > 0) {
            chatWindow.removeChild(chatWindow.lastChild);
        }

        data.messages.forEach(msg => {
            addMessageToChat(msg.role === 'user' ? 'user' : 'bot', msg.content);
        });

        conversationId = id;
    } catch (error) {
        console.error('Error loading conversation:', error);
    }
}
