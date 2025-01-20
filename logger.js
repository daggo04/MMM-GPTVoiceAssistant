const fs = require('fs').promises;
const path = require('path');

class ConversationLogger {
    constructor(modulePath) {
        this.logsDir = path.join(modulePath, 'logs');
        this.currentConversation = [];
        this.preSessionBuffer = [];  // Buffer for events before session starts
        this.currentSessionId = null;
        this.currentFilePath = null;
        this.ensureLogsDirectory();
    }

    async ensureLogsDirectory() {
        try {
            await fs.access(this.logsDir);
        } catch (error) {
            if (error.code === 'ENOENT') {
                await fs.mkdir(this.logsDir, { recursive: true });
                console.log('Created logs directory:', this.logsDir);
            } else {
                console.error('Error accessing logs directory:', error);
            }
        }
    }

    startNewSession(sessionId) {
        // Only start new session if it's different from current
        if (this.currentSessionId !== sessionId) {
            if (this.currentSessionId) {
                this.saveCurrentConversation();
            }
            this.currentSessionId = sessionId;
            this.currentConversation = [...this.preSessionBuffer];
            this.preSessionBuffer = [];
            
            // Create the fixed filepath for this session
            const timestamp = new Date().toISOString().split('T')[0]; // Just the date part
            this.currentFilePath = path.join(this.logsDir, `conversation_${sessionId}_${timestamp}.json`);
            
            console.log(`Started new logging session: ${sessionId}`);
        }
    }

    logEvent(event, direction = 'received') {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            direction,
            event
        };

        if (!this.currentSessionId) {
            this.preSessionBuffer.push(logEntry);
            console.log('Buffering pre-session event:', event.type);
            return;
        }

        this.currentConversation.push(logEntry);

        // Debounce the save operation
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        this.saveTimeout = setTimeout(() => this.saveCurrentConversation(), 1000);
    }

    async saveCurrentConversation() {
        if (!this.currentSessionId || !this.currentFilePath || this.currentConversation.length === 0) {
            return;
        }

        try {
            const conversationData = {
                sessionId: this.currentSessionId,
                startTime: this.currentConversation[0].timestamp,
                endTime: this.currentConversation[this.currentConversation.length - 1].timestamp,
                events: this.currentConversation
            };

            await fs.writeFile(
                this.currentFilePath,
                JSON.stringify(conversationData, null, 2),
                'utf8'
            );
            console.log(`Updated conversation log: ${path.basename(this.currentFilePath)}`);
        } catch (error) {
            console.error('Error saving conversation log:', error);
        }
    }

    endSession() {
        if (this.currentSessionId) {
            this.saveCurrentConversation();
            console.log(`Ended logging session: ${this.currentSessionId}`);
            this.currentSessionId = null;
            this.currentFilePath = null;
            this.currentConversation = [];
            this.preSessionBuffer = [];
        }
    }

    getSessionId() {
        return this.currentSessionId;
    }

    getBufferedEventCount() {
        return this.preSessionBuffer.length;
    }
}

module.exports = ConversationLogger;