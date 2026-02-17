class CustomProcessPalette {
    constructor(bpmnFactory, create, elementFactory, palette, translate, handTool, lassoTool, spaceTool, globalConnect) {
        this.bpmnFactory = bpmnFactory;
        this.create = create;
        this.elementFactory = elementFactory;
        this.translate = translate;
        this.handTool = handTool;
        this.lassoTool = lassoTool;
        this.spaceTool = spaceTool;
        this.globalConnect = globalConnect;

        palette.registerProvider(this);
    }

    getPaletteEntries(element) {
        const { bpmnFactory, create, elementFactory, translate, handTool, lassoTool, spaceTool, globalConnect } = this;

        function createProcess(processType) {
            return function (event) {
                const businessObject = bpmnFactory.create("bpmn:SubProcess", {
                    name: processType === "process" ? "New Process" : "New Value Chain"
                });

                businessObject.set("process:processType", processType);
                businessObject.set("process:processName", businessObject.name);
                businessObject.set("process:processId", `proc_${Date.now()}`);

                const shape = elementFactory.createShape({
                    type: "bpmn:SubProcess",
                    businessObject: businessObject,
                    width: 260,
                    height: 60
                });

                create.start(event, shape);
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