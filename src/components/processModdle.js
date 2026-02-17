export const processModdle = {
    name: "Process",
    uri: "http://lowcodelabs/schema/process",
    prefix: "process",
    xml: {
        tagAlias: "lowerCase"
    },
    types: [
        {
            name: "Process",
            extends: ["bpmn:SubProcess"],
            properties: [
                {
                    name: "processId",
                    isAttr: true,
                    type: "String"
                },
                {
                    name: "processName",
                    isAttr: true,
                    type: "String"
                },
                {
                    name: "processType",
                    isAttr: true,
                    type: "String"
                }
            ]
        }
    ]
};