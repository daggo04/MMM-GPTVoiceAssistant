class FunctionHandler {
    constructor() {
        // Define all function implementations
        this.functions = {
            endConversation: this.endConversation.bind(this),
            getWeather: this.getWeather.bind(this),
            setVolume: this.setVolume.bind(this),
            hideModule: this.hideModule.bind(this),
            showModule: this.showModule.bind(this)
        };

        // Function definitions that will be sent to the assistant
        this.functionDefinitions = [
            {
                type: 'function',
                name: 'endConversation',
                description: 'Ends the current conversation and turns off the voice assistant',
                parameters: {
                    type: 'object',
                    properties: {} // No parameters needed
                }
            },
            {
                type: 'function',
                name: 'getWeather',
                description: 'Gets the current weather information',
                parameters: {
                    type: 'object',
                    properties: {} // No parameters needed as weather module uses configured location
                }
            },
            {
                type: 'function',
                name: 'setVolume',
                description: 'Sets the volume of the mirror audio',
                parameters: {
                    type: 'object',
                    properties: {
                        level: {
                            type: 'number',
                            description: 'Volume level from 0 to 100',
                            minimum: 0,
                            maximum: 100
                        }
                    },
                    required: ['level']
                }
            },
            {
                type: 'function',
                name: 'hideModule',
                description: 'Hides a specific module on the mirror',
                parameters: {
                    type: 'object',
                    properties: {
                        moduleName: {
                            type: 'string',
                            description: 'Name of the module to hide'
                        }
                    },
                    required: ['moduleName']
                }
            },
            {
                type: 'function',
                name: 'showModule',
                description: 'Shows a previously hidden module',
                parameters: {
                    type: 'object',
                    properties: {
                        moduleName: {
                            type: 'string',
                            description: 'Name of the module to show'
                        }
                    },
                    required: ['moduleName']
                }
            }
        ];
    }

    // Function implementations
    async endConversation() {
        return {
            success: true,
            action: "END_CONVERSATION",
            message: "Conversation ended"
        };
    }

    async getWeather() {
        return {
            success: true,
            action: "GET_WEATHER",
            message: "Weather request sent"
        };
    }

    async setVolume(args) {
        const level = Math.max(0, Math.min(100, args.level));
        return {
            success: true,
            action: "SET_VOLUME",
            level: level,
            message: `Volume set to ${level}`
        };
    }

    async hideModule(args) {
        return {
            success: true,
            action: "HIDE_MODULE",
            moduleName: args.moduleName,
            message: `Module ${args.moduleName} hide requested`
        };
    }

    async showModule(args) {
        return {
            success: true,
            action: "SHOW_MODULE",
            moduleName: args.moduleName,
            message: `Module ${args.moduleName} show requested`
        };
    }

    // Get function definitions for assistant configuration
    getFunctionDefinitions() {
        return this.functionDefinitions;
    }

    // Execute a function by name
    async executeFunction(functionName, args) {
        const fn = this.functions[functionName];
        if (!fn) {
            throw new Error(`Unknown function: ${functionName}`);
        }
        
        try {
            return await fn(args);
        } catch (error) {
            console.error(`Error executing function ${functionName}:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = FunctionHandler;