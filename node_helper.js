const NodeHelper = require("node_helper");
const fetch = require('node-fetch');
const path = require('path');
const FunctionHandler = require(path.resolve(__dirname, 'function-handler.js'));
const ConversationLogger = require(path.resolve(__dirname, 'logger.js'));

module.exports = NodeHelper.create({
    start: function () {
        console.log("Starting helper for: MMM-GPTVoiceAssistant");
        this.functionHandler = new FunctionHandler();
        this.logger = new ConversationLogger(__dirname);
        this.reset();
    },

    reset: function() {
        console.log("Resetting helper state");
        this.assistantConfig = this.getDefaultAssistantConfig();
        if (this.logger) {
            this.logger.endSession();
        }
    },

    getDefaultAssistantConfig() {
        return {
            type: "session.update",  // Add this line to specify the event type
            session: {              // Wrap configuration in a session object
                instructions: "You are Mirror, a helpful digital assistant for a magic mirror. Be concise and clear in your responses. Conversations are automatically timed out after 1 minute of inactivity. You can however end a conversation if the user requests it by calling the endConversation tool.",
                modalities: ['text', 'audio'],
                tools: this.functionHandler.getFunctionDefinitions()
            }
        };
    },

    async getEphemeralToken() {
        try {
            const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: "gpt-4o-realtime-preview-2024-12-17",
                    voice: "shimmer",
                }),
            });
    
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to get ephemeral token: ${response.status}, ${errorText}`);
            }
    
            const data = await response.json();
            
            // Log the full session creation response
            this.logger.logEvent({
                type: 'session_creation',
                response: data
            }, 'received');
            
            // Start new session logging with the session ID - data.id instead of data.session.id
            if (data.id) {
                console.log(`Starting new session with ID: ${data.id}`);
                this.logger.startNewSession(data.id);
                
                // Log how many buffered events were incorporated
                const bufferedCount = this.logger.getBufferedEventCount();
                if (bufferedCount > 0) {
                    console.log(`Incorporated ${bufferedCount} buffered events into new session`);
                }
            } else {
                console.error('No session ID in response:', data);
            }
            
            return data.client_secret.value;
        } catch (error) {
            console.error("Error getting ephemeral token:", error);
            throw error;
        }
    },

    async relayToOpenAI(payload) {
        try {
            const { sdp, token } = payload;
            
            // Log outgoing SDP
            this.logger.logEvent({ type: 'sdp_offer', sdp }, 'sent');
            
            const response = await fetch("https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17", {
                method: "POST",
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/sdp',
                },
                body: sdp
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const answerSdp = await response.text();
            
            // Log incoming SDP
            this.logger.logEvent({ type: 'sdp_answer', sdp: answerSdp }, 'received');
            
            this.sendSocketNotification("OPENAI_ANSWER", { sdp: answerSdp });
        } catch (error) {
            console.error("Error relaying to OpenAI:", error);
            this.sendSocketNotification("ERROR", { message: error.message });
        }
    },

    updateAssistantConfig(config) {
        // Merge new config with existing, allowing partial updates
        this.assistantConfig = {
            ...this.assistantConfig,
            ...config
        };
    },

    async handleFunctionCall(message) {
        try {
            // Log the function call request
            this.logger.logEvent({ 
                type: 'function_call_request',
                name: message.name,
                arguments: message.arguments
            }, 'received');
            
            const functionName = message.name;
            const args = message.arguments ? JSON.parse(message.arguments) : {};
            
            const result = await this.functionHandler.executeFunction(functionName, args);
            
            // Log the function result
            this.logger.logEvent({
                type: 'function_call_result',
                name: functionName,
                result: result
            }, 'sent');

            if (result.success) {
                switch (result.action) {
                    case "END_CONVERSATION":
                        this.sendSocketNotification("CHANGE_STATE", { state: "OFF" });
                        this.logger.endSession();
                        break;
                    case "SET_VOLUME":
                        this.sendSocketNotification("UPDATE_VOLUME", { level: result.level });
                        break;
                    case "HIDE_MODULE":
                    case "SHOW_MODULE":
                        this.sendSocketNotification("MODULE_VISIBILITY", {
                            action: result.action,
                            moduleName: result.moduleName
                        });
                        break;
                }
            }

            this.sendSocketNotification("FUNCTION_RESULT", {
                call_id: message.call_id,
                result: result
            });

        } catch (error) {
            console.error("Error handling function call:", error);
            // Log the error
            this.logger.logEvent({
                type: 'function_call_error',
                name: message.name,
                error: error.message
            }, 'error');
            
            this.sendSocketNotification("FUNCTION_ERROR", {
                call_id: message.call_id,
                error: error.message
            });
        }
    },

    socketNotificationReceived: async function (notification, payload) {
        // Log all socket notifications except high-frequency events
        if (notification !== "RELAY_TO_OPENAI") {
            this.logger.logEvent({
                type: 'socket_notification',
                notification,
                payload
            }, 'received');
        }

        switch (notification) {
            case "START_SESSION":
                try {
                    const token = await this.getEphemeralToken();
                    this.sendSocketNotification("TOKEN_RECEIVED", { token });
                } catch (error) {
                    console.error("Error starting session:", error);
                    this.sendSocketNotification("ERROR", { message: error.message });
                }
                break;

            case "RELAY_TO_OPENAI":
                await this.relayToOpenAI(payload);
                break;

            case "FUNCTION_CALL":
                await this.handleFunctionCall(payload);
                break;

            case "REQUEST_ASSISTANT_CONFIG":
                this.sendSocketNotification("ASSISTANT_CONFIG", this.assistantConfig);
                break;

            case "UPDATE_ASSISTANT_CONFIG":
                this.updateAssistantConfig(payload);
                // Log the config update
                this.logger.logEvent({
                    type: 'assistant_config_update',
                    config: this.assistantConfig
                }, 'sent');
                this.sendSocketNotification("ASSISTANT_CONFIG", this.assistantConfig);
                break;
        }
    },

    stop: function() {
        console.log("Stopping module helper: MMM-GPTVoiceAssistant");
        this.logger.endSession();
        this.reset();
    }
});