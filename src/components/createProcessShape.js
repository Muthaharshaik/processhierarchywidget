/**
 * Builds a process node (a bpmn:SubProcess carrying the process: attributes).
 *
 * Shared by the palette and the context pad so a process dragged in from the
 * left panel and one appended straight off a node are byte-for-byte identical
 * in the saved XML.
 */
export const NODE_WIDTH  = 100;
export const NODE_HEIGHT = 80;

const DEFAULT_NAMES = {
    process:    "New Process",
    valuechain: "New Value Chain"
};

/**
 * Timestamp ids collide when two nodes are created inside the same millisecond
 * (append-then-append, or an automated flow), so the registry gets a look-in.
 * The id is the key the surrounding Mendix app navigates by, so a duplicate is
 * worse here than a slightly uglier id.
 */
function nextProcessId(elementRegistry) {
    const base = `proc_${Date.now()}`;
    if (!elementRegistry) return base;

    const taken = new Set();
    elementRegistry.getAll().forEach(el => {
        const processId = el.businessObject?.get?.("process:processId");
        if (processId) taken.add(processId);
    });

    if (!taken.has(base)) return base;

    let suffix = 2;
    while (taken.has(`${base}_${suffix}`)) suffix++;
    return `${base}_${suffix}`;
}

export function createProcessShape(bpmnFactory, elementFactory, elementRegistry, processType) {
    const type = processType === "valuechain" ? "valuechain" : "process";
    const name = DEFAULT_NAMES[type];

    const businessObject = bpmnFactory.create("bpmn:SubProcess", { name });
    businessObject.set("process:processType", type);
    businessObject.set("process:processName", name);
    businessObject.set("process:processId",   nextProcessId(elementRegistry));

    return elementFactory.createShape({
        type: "bpmn:SubProcess",
        businessObject,
        width:  NODE_WIDTH,
        height: NODE_HEIGHT
    });
}
