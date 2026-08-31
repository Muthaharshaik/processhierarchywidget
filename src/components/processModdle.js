export const processModdle = {
    name: "Process",
    uri: "http://lowcodelabs/schema/process",
    prefix: "process",
    /**
     * Do not remove — this looks redundant (the package serialises no elements of
     * its own) but it is what keeps our saved XML spec-compliant.
     *
     * `extends: ["bpmn:SubProcess"]` below re-homes the bpmn type's descriptor
     * onto this package — verifiable with
     * `moddle.getType("bpmn:SubProcess").$descriptor.$pkg.name`, which returns
     * "Process", not "bpmn". moddle-xml then derives the element tag from the
     * owning package's tagAlias (nameToAlias → lower(name) only when
     * pkg.xml.tagAlias === "lowerCase"), so without this block the writer emits
     * the type name verbatim: <bpmn:SubProcess> instead of the spec's
     * <bpmn:subProcess> (Semantic.xsd: element names are lowerCamelCase, type
     * names UpperCamelCase). Only the extended type would be affected — sibling
     * tags such as <bpmn:process> and <bpmn:sequenceFlow> stay correct, which is
     * what makes the breakage easy to miss.
     *
     * Attribute names are unaffected by tagAlias, so process:processId and
     * friends keep their casing either way. The capitalised JS type names in
     * is(element, "bpmn:SubProcess") / bpmnFactory.create("bpmn:SubProcess") are
     * bpmn-js *type* names and are correct — unrelated to the XML tag.
     */
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