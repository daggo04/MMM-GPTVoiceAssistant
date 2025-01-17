const NodeHelper = require("node_helper");
const fetch = require('node-fetch');
const path = require('path');
const FunctionHandler = require(path.resolve(__dirname, 'function-handler.js'));

module.exports = NodeHelper.create({
    start: function () {
        console.log("Starting helper for: MMM-GPTVoiceAssistant");
        this.functionHandler = new FunctionHandler();
        this.reset();
    },

    reset: function() {
        console.log("Resetting helper state");
        this.assistantConfig = this.getDefaultAssistantConfig();
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
            return data.client_secret.value;
        } catch (error) {
            console.error("Error getting ephemeral token:", error);
            throw error;
        }
    },

    async relayToOpenAI(payload) {
        try {
            const { sdp, token } = payload;
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
            // Extract function name and arguments from the message
            const functionName = message.name;
            const args = message.arguments ? JSON.parse(message.arguments) : {};
            
            // Execute the function through the FunctionHandler
            const result = await this.functionHandler.executeFunction(functionName, args);
            
            // Handle any required state changes based on the function result
            if (result.success) {
                // Send state change notifications to the main module if needed
                switch (result.action) {
                    case "END_CONVERSATION":
                        this.sendSocketNotification("CHANGE_STATE", { state: "OFF" });
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

            // Send the function result back to be added to the conversation
            this.sendSocketNotification("FUNCTION_RESULT", {
                call_id: message.call_id,
                result: result
            });

        } catch (error) {
            console.error("Error handling function call:", error);
            this.sendSocketNotification("FUNCTION_ERROR", {
                call_id: message.call_id,
                error: error.message
            });
        }
    },

    socketNotificationReceived: async function (notification, payload) {
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
                this.sendSocketNotification("ASSISTANT_CONFIG", this.assistantConfig);
                break;
        }
    },

    stop: function() {
        console.log("Stopping module helper: MMM-GPTVoiceAssistant");
        this.reset();
    }
});