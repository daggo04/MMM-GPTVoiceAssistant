/* exported FunctionHandler */

class FunctionHandler {
    constructor(module) {
        this.module = module;
        this.functions = {
            endConversation: this.endConversation.bind(this)
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
            }
        ];
    }

    // Function implementations
    async endConversation() {
        this.module.setState(this.module.STATES.OFF);
        return { success: true, message: "Conversation ended" };
    }

    // Handle function calls from the assistant
    async handleFunctionCall(message) {
        try {
            if (message.type === 'response.function_call_arguments.done') {
                const fn = this.functions[message.name];
                if (fn) {
                    console.log(`Executing function: ${message.name}`);
                    const args = message.arguments ? JSON.parse(message.arguments) : {};
                    const result = await fn(args);

                    // Send function output back to the assistant
                    const event = {
                        type: 'conversation.item.create',
                        item: {
                            type: 'function_call_output',
                            call_id: message.call_id,
                            output: JSON.stringify(result)
                        }
                    };

                    if (this.module.dataChannel) {
                        this.module.dataChannel.send(JSON.stringify(event));
                    }
                }
            }
        } catch (error) {
            console.error('Error handling function call:', error);
        }
    }

    // Get function definitions for assistant configuration
    getFunctionDefinitions() {
        return this.functionDefinitions;
    }
}