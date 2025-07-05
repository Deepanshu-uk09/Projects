from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import time
import json
import uuid
import random
import logging
from datetime import datetime
import os
import re
import string
import nltk
import requests  # Added for Gemini API call
from nltk.tokenize import word_tokenize
from nltk.corpus import stopwords
from nltk.stem import WordNetLemmatizer

# Load Gemini API key
GEMINI_API_KEY = os.getenv("AIzaSyCPsRkNW9r9204AX6y61wpsWN_C64-8aF4")

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Set up logging
logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Ensure NLTK downloads
try:
    nltk.data.find('tokenizers/punkt')
    nltk.data.find('corpora/stopwords')
    nltk.data.find('corpora/wordnet')
except LookupError:
    nltk.download('punkt')
    nltk.download('stopwords')
    nltk.download('wordnet')

# Initialize NLP tools
lemmatizer = WordNetLemmatizer()
stop_words = set(stopwords.words('english'))

# In-memory database
class InMemoryDB:
    def __init__(self):
        self.conversations = {}
        self.users = {}

    def create_conversation(self, user_id):
        conv_id = str(uuid.uuid4())
        timestamp = datetime.now().isoformat()
        self.conversations[conv_id] = {
            'id': conv_id,
            'user_id': user_id,
            'created_at': timestamp,
            'updated_at': timestamp,
            'messages': []
        }
        return conv_id

    def add_message(self, conv_id, role, content):
        if conv_id not in self.conversations:
            return None

        message_id = str(uuid.uuid4())
        timestamp = datetime.now().isoformat()
        message = {
            'id': message_id,
            'conversation_id': conv_id,
            'role': role,
            'content': content,
            'created_at': timestamp
        }

        self.conversations[conv_id]['messages'].append(message)
        self.conversations[conv_id]['updated_at'] = timestamp
        return message_id

    def get_conversation(self, conv_id):
        return self.conversations.get(conv_id)

    def get_user_conversations(self, user_id):
        return [conv for conv in self.conversations.values() if conv['user_id'] == user_id]

    def register_user(self, username, password_hash):
        user_id = str(uuid.uuid4())
        self.users[user_id] = {
            'id': user_id,
            'username': username,
            'password_hash': password_hash,
            'created_at': datetime.now().isoformat()
        }
        return user_id

# Initialize DB
db = InMemoryDB()

# Health check
@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({"status": "healthy", "timestamp": datetime.now().isoformat()})

# Streaming chat with Gemini API
@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.json

    if not data or 'message' not in data:
        return jsonify({'error': 'No message provided'}), 400

    user_message = data['message']
    conversation_id = data.get('conversation_id')
    user_id = data.get('user_id', 'anonymous')

    if not conversation_id or conversation_id not in db.conversations:
        conversation_id = db.create_conversation(user_id)

    conversation = db.get_conversation(conversation_id)
    conversation_history = conversation['messages'] if conversation else []

    db.add_message(conversation_id, 'user', user_message)

    def generate():
        try:
            # Prepare the payload for Gemini API
            payload = {
                "contents": [
                    {
                        "parts": [
                            {"text": msg['content']}
                            for msg in conversation_history
                            if msg['role'] == 'user'
                        ] + [{"text": user_message}]
                    }
                ]
            }

            # Make the API call to Gemini
            response = requests.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={"AIzaSyCPsRkNW9r9204AX6y61wpsWN_C64-8aF4"}",
                headers={"Content-Type": "application/json"},
                json=payload,
                stream=True
            )

            if not response.ok:
                logger.error(f"Gemini API error: {response.status_code}")
                yield f"data: [Error]: Server error {response.status_code}\n\n"
                return

            full_reply = ""
            for chunk in response.iter_content(chunk_size=None, decode_unicode=True):
                if chunk:
                    # Parse the chunk (assuming JSON response from Gemini)
                    try:
                        chunk_data = json.loads(chunk)
                        if 'candidates' in chunk_data and len(chunk_data['candidates']) > 0:
                            content = chunk_data['candidates'][0]['content']['parts'][0]['text']
                            full_reply += content
                            yield f"data: {content}\n\n"
                    except json.JSONDecodeError:
                        continue  # Skip malformed chunks

            db.add_message(conversation_id, 'assistant', full_reply)

        except Exception as e:
            logger.error(f"Gemini API stream failed: {str(e)}")
            yield f"data: [Error]: {str(e)}\n\n"

    return Response(generate(), mimetype='text/event-stream')

# Get all user conversations
@app.route('/api/conversations', methods=['GET'])
def get_conversations():
    user_id = request.args.get('user_id', 'anonymous')
    conversations = db.get_user_conversations(user_id)
    result = []
    for conv in conversations:
        result.append({
            'id': conv['id'],
            'created_at': conv['created_at'],
            'updated_at': conv['updated_at'],
            'message_count': len(conv['messages']),
            'preview': conv['messages'][0]['content'][:50] + '...' if conv['messages'] else 'Empty conversation'
        })
    return jsonify(result)

# Get a single conversation
@app.route('/api/conversations/<conversation_id>', methods=['GET'])
def get_conversation(conversation_id):
    conversation = db.get_conversation(conversation_id)
    if not conversation:
        return jsonify({'error': 'Conversation not found'}), 404
    return jsonify(conversation)

# Run app
if __name__ == '__main__':
    app.run(debug=True)