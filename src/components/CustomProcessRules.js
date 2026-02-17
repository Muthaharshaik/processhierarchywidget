import RuleProvider from "diagram-js/lib/features/rules/RuleProvider";
import { is } from "bpmn-js/lib/util/ModelUtil";

/**
 * Custom Rules for Process Hierarchy
 * - Processes can only connect to other processes
 * - No other BPMN elements allowed except processes
 */
class CustomProcessRules extends RuleProvider {
    constructor(eventBus) {
        super(eventBus);
    }

    init() {
        this.addRule('shape.toggleCollapse', () => {
            return false;
        });

        // Allow connections between processes
        this.addRule("connection.create", (context) => {
            const source = context.source;
            const target = context.target;

            // Only allow connections between SubProcesses (processes)
            if (is(source, "bpmn:SubProcess") && is(target, "bpmn:SubProcess")) {
                return { type: 'bpmn:SequenceFlow' };
            }

            return false;
        });

        // Allow connection reconnection
        this.addRule("connection.reconnect", (context) => {
            const connection = context.connection;
            const source = context.source || connection.source;
            const target = context.target || connection.target;

            if (is(source, "bpmn:SubProcess") && is(target, "bpmn:SubProcess")) {
                return true;
            }

            return false;
        });

        // Restrict what can be added from palette
        this.addRule("shape.create", (context) => {
            const shape = context.shape;

            // Only allow SubProcess (processes) to be created
            if (is(shape, "bpmn:SubProcess")) {
                return true;
            }

            // Don't allow other BPMN elements
            return false;
        });
    }
}

CustomProcessRules.$inject = ["eventBus"];

// Export as module
export default {
    __init__: ["customProcessRules"],
    customProcessRules: ["type", CustomProcessRules]
};