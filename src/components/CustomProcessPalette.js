import { createProcessShape } from "./createProcessShape";

class CustomProcessPalette {
    constructor(bpmnFactory, create, elementFactory, elementRegistry, palette, translate, handTool, lassoTool, spaceTool, globalConnect) {
        this.bpmnFactory = bpmnFactory;
        this.create = create;
        this.elementFactory = elementFactory;
        this.elementRegistry = elementRegistry;
        this.translate = translate;
        this.handTool = handTool;
        this.lassoTool = lassoTool;
        this.spaceTool = spaceTool;
        this.globalConnect = globalConnect;

        palette.registerProvider(this);
    }

    getPaletteEntries(element) {
        const { bpmnFactory, create, elementFactory, elementRegistry, translate, handTool, lassoTool, spaceTool, globalConnect } = this;

        function createProcess(processType) {
            return function (event) {
                create.start(
                    event,
                    createProcessShape(bpmnFactory, elementFactory, elementRegistry, processType)
                );
            };
        }

        return {
            "hand-tool": {
                group: "tools",
                className: "bpmn-icon-hand-tool",
                title: "Move",
                action: {
                    click: function(event) {
                        handTool.activateHand(event);
                    }
                }
            },
            "lasso-tool": {
                group: "tools",
                className: "bpmn-icon-lasso-tool",
                title: "Lasso",
                action: {
                    click: function(event) {
                        lassoTool.activateSelection(event);
                    }
                }
            },
            "space-tool": {
                group: "tools",
                className: "bpmn-icon-space-tool",
                title: "Space",
                action: {
                    click: function(event) {
                        spaceTool.activateSelection(event);
                    }
                }
            },
            "global-connect-tool": {
                group: "tools",
                className: "bpmn-icon-connection-multi",
                title: "Connect",
                action: {
                    click: function(event) {
                        globalConnect.start(event);
                    }
                }
            },
            "create.process": {
                group: "activity",
                className: "bpmn-icon-task",
                title: "Process",
                action: {
                    dragstart: createProcess("process"),
                    click: createProcess("process")
                }
            },
            "create.valuechain": {
                group: "activity",
                className: "bpmn-icon-manual-task",
                title: "Value Chain",
                action: {
                    dragstart: createProcess("valuechain"),
                    click: createProcess("valuechain")
                }
            }
        };
    }
}

CustomProcessPalette.$inject = [
    "bpmnFactory",
    "create",
    "elementFactory",
    "elementRegistry",
    "palette",
    "translate",
    "handTool",
    "lassoTool",
    "spaceTool",
    "globalConnect"
];

export default {
    __init__: ["customProcessPalette"],
    customProcessPalette: ["type", CustomProcessPalette]
};