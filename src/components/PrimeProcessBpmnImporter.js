/**
 * Prime BPMN → Process Hierarchy importer.
 *
 * Prime exports its process layer as near-plain BPMN: nodes are bpmn:task /
 * bpmn:subProcess with no process: namespace, value chains are emitted with a
 * "2" suffixed tag (bpmn:task2), and the files routinely contain things bpmn-js
 * refuses or silently drops:
 *
 *   - non-standard tags such as bpmn:task2 → moddle cannot resolve the type and
 *     the whole import fails
 *   - sequenceFlow without sourceRef/targetRef (dangling connector in Prime)
 *   - flows with no matching bpmndi:BPMNEdge  → connection never reaches the
 *     canvas, so the parent/child hierarchy this widget derives from outgoing
 *     flows would be lost
 *   - nodes with no bpmndi:BPMNShape          → node never reaches the canvas
 *   - extra bpmndi:BPMNDiagram / BPMNPlane entries, including one with no
 *     bpmnElement at all → import error
 *   - non-standard attributes such as editable="false"
 *
 * So we do not hand the file to the modeler as-is. We read what matters
 * (activities, flows, positions) and re-emit a clean document in the shape this
 * widget already speaks: every node a bpmn:SubProcess carrying
 * process:processId + process:processName + process:processType, one process,
 * one diagram.
 *
 * What we do NOT do is invent structure. The imported diagram mirrors the file:
 * no root node is added, and nodes the file left unconnected stay unconnected,
 * exactly as Prime displays them. Building the hierarchy out is the user's job
 * once the processes are on the canvas.
 */

const NS = {
    bpmn:    "http://www.omg.org/spec/BPMN/20100524/MODEL",
    bpmndi:  "http://www.omg.org/spec/BPMN/20100524/DI",
    dc:      "http://www.omg.org/spec/DD/20100524/DC",
    di:      "http://www.omg.org/spec/DD/20100524/DI",
    process: "http://lowcodelabs/schema/process"
};

// Everything Prime may have used to draw a process box. Events and gateways are
// meaningless in a process hierarchy and are reported as skipped.
const ACTIVITY_TAGS = new Set([
    "task",
    "subProcess",
    "callActivity",
    "userTask",
    "manualTask",
    "serviceTask",
    "scriptTask",
    "sendTask",
    "receiveTask",
    "businessRuleTask",
    "transaction",
    "adHocSubProcess"
]);

/**
 * Prime marks a value chain by suffixing the activity tag with "2"
 * (bpmn:task2). Derived from ACTIVITY_TAGS so the convention holds for whichever
 * base tag Prime happens to use.
 */
const VALUECHAIN_TAGS = new Set(Array.from(ACTIVITY_TAGS, tag => `${tag}2`));

const isActivityTag   = localName => ACTIVITY_TAGS.has(localName) || VALUECHAIN_TAGS.has(localName);
const isValueChainTag = localName => VALUECHAIN_TAGS.has(localName);

// Matches the palette: compact square cards.
const NODE_W = 100;
const NODE_H = 80;

// ── Small helpers ────────────────────────────────────────────────────────────

function escapeXml(value) {
    return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

/** XML ids must be NCNames — Prime ids already are, but imported files vary. */
function sanitizeId(raw, fallback) {
    let id = String(raw || "").trim().replace(/[^A-Za-z0-9_.-]/g, "_");
    if (!id) id = fallback;
    if (/^[^A-Za-z_]/.test(id)) id = `id_${id}`;
    return id;
}

/**
 * Namespace-aware lookup with a prefix-only fallback: some tools emit BPMN
 * without declaring the standard namespaces, which would make
 * getElementsByTagNameNS come back empty.
 */
function findElements(doc, namespace, localName) {
    const byNs = Array.from(doc.getElementsByTagNameNS(namespace, localName));
    if (byNs.length) return byNs;
    return Array.from(doc.getElementsByTagName("*")).filter(el => el.localName === localName);
}

function findAllActivities(doc) {
    let candidates = Array.from(doc.getElementsByTagNameNS(NS.bpmn, "*"));
    if (!candidates.length) candidates = Array.from(doc.getElementsByTagName("*"));
    return candidates.filter(el => isActivityTag(el.localName));
}

function findAllByLocalNames(doc, namespace, localNames) {
    let candidates = Array.from(doc.getElementsByTagNameNS(namespace, "*"));
    if (!candidates.length) candidates = Array.from(doc.getElementsByTagName("*"));
    return candidates.filter(el => localNames.has(el.localName));
}

function firstChildByLocalName(element, localName) {
    return Array.from(element.children).find(child => child.localName === localName) || null;
}

function readNumber(value) {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : null;
}

function readBounds(element) {
    const bounds = firstChildByLocalName(element, "Bounds");
    if (!bounds) return null;
    const x = readNumber(bounds.getAttribute("x"));
    const y = readNumber(bounds.getAttribute("y"));
    const width  = readNumber(bounds.getAttribute("width"));
    const height = readNumber(bounds.getAttribute("height"));
    if (x === null || y === null) return null;
    return {
        x,
        y,
        width:  width  && width  > 0 ? width  : NODE_W,
        height: height && height > 0 ? height : NODE_H
    };
}

// ── Parse ────────────────────────────────────────────────────────────────────

function parseDocument(xmlString) {
    const doc = new DOMParser().parseFromString(xmlString, "text/xml");
    const parseError = doc.getElementsByTagName("parsererror")[0];
    if (parseError) {
        throw new Error("The file is not valid XML. Please select a BPMN file exported from Prime.");
    }
    const definitions = doc.documentElement;
    if (!definitions || definitions.localName !== "definitions") {
        throw new Error("No <bpmn:definitions> found. This does not look like a BPMN file.");
    }
    return doc;
}

/** bpmnElement → bounds, first plane wins (drilldown planes repeat elements). */
function collectDiBounds(doc) {
    const map = new Map();
    findElements(doc, NS.bpmndi, "BPMNShape").forEach(shape => {
        const ref = shape.getAttribute("bpmnElement");
        if (!ref || map.has(ref)) return;
        const bounds = readBounds(shape);
        if (bounds) map.set(ref, bounds);
    });
    return map;
}

/** bpmnElement → waypoints, so an unchanged layout stays recognisable. */
function collectDiWaypoints(doc) {
    const map = new Map();
    findElements(doc, NS.bpmndi, "BPMNEdge").forEach(edge => {
        const ref = edge.getAttribute("bpmnElement");
        if (!ref || map.has(ref)) return;
        const points = Array.from(edge.children)
            .filter(child => child.localName === "waypoint")
            .map(child => ({ x: readNumber(child.getAttribute("x")), y: readNumber(child.getAttribute("y")) }))
            .filter(p => p.x !== null && p.y !== null);
        if (points.length >= 2) map.set(ref, points);
    });
    return map;
}

function collectNodes(doc, diBounds) {
    const nodes = [];
    const byOriginalId = new Map();
    const usedIds = new Set();

    findAllActivities(doc).forEach((el, index) => {
        const originalId = el.getAttribute("id") || `Node_${index}`;
        if (byOriginalId.has(originalId)) return;

        const id = sanitizeId(originalId, `Process_${index}`);
        let uniqueId = id;
        let suffix = 2;
        while (usedIds.has(uniqueId)) uniqueId = `${id}_${suffix++}`;
        usedIds.add(uniqueId);

        const name = (el.getAttribute("name") || "").trim();
        // Re-importing a file this widget exported: keep its identity as-is.
        const existingProcessId   = el.getAttributeNS(NS.process, "processId")   || null;
        const existingProcessName = el.getAttributeNS(NS.process, "processName") || null;
        const existingProcessType = el.getAttributeNS(NS.process, "processType") || null;

        const node = {
            id: uniqueId,
            originalId,
            element: el,
            name: name || existingProcessName || uniqueId,
            processId:   existingProcessId || `proc_${uniqueId}`,
            processType: existingProcessType || (isValueChainTag(el.localName) ? "valuechain" : "process"),
            isRoot: existingProcessId === "root",
            bounds: diBounds.get(originalId) || null,
            parentId: null,
            parentNode: null,
            children: []
        };

        nodes.push(node);
        byOriginalId.set(originalId, node);
    });

    return { nodes, byOriginalId };
}

function countSkippedFlowNodes(doc) {
    const skippable = new Set([
        "startEvent",
        "endEvent",
        "intermediateCatchEvent",
        "intermediateThrowEvent",
        "boundaryEvent",
        "exclusiveGateway",
        "inclusiveGateway",
        "parallelGateway",
        "eventBasedGateway",
        "complexGateway",
        "dataObjectReference",
        "dataStoreReference"
    ]);
    return findAllByLocalNames(doc, NS.bpmn, skippable).length;
}

/**
 * Explicit sequence flows first, then BPMN nesting (a node physically inside
 * another activity) as an implicit parent link — some Prime exports express the
 * hierarchy that way instead of with flows.
 */
function collectEdges(doc, byOriginalId) {
    const edges = [];
    const droppedFlows = [];
    const claimedChildren = new Set();
    const usedIds = new Set();
    const seenPairs = new Set();

    // target is already an ancestor of source → this link would close a cycle.
    const wouldCycle = (source, target) => {
        let current = source;
        const guard = new Set();
        while (current && !guard.has(current.id)) {
            if (current.id === target.id) return true;
            guard.add(current.id);
            current = current.parentNode || null;
        }
        return false;
    };

    const addEdge = (id, source, target) => {
        const pair = `${source.id}>${target.id}`;
        if (seenPairs.has(pair)) return false;
        // One parent per process — the widget validates this on save, so a second
        // incoming link is dropped here rather than imported into an invalid state.
        if (claimedChildren.has(target.id)) return false;
        if (source.id === target.id) return false;
        // A cycle would leave every node in the ring with a parent, so nothing in
        // it hangs off the top of the hierarchy — the ring reads as unreachable in
        // the widget. Break it by dropping the closing link.
        if (wouldCycle(source, target)) return false;

        let uniqueId = sanitizeId(id, `SequenceFlow_${edges.length}`);
        let suffix = 2;
        while (usedIds.has(uniqueId)) uniqueId = `${uniqueId}_${suffix++}`;
        usedIds.add(uniqueId);

        seenPairs.add(pair);
        claimedChildren.add(target.id);
        target.parentId   = source.id;
        target.parentNode = source;
        source.children.push(target.id);
        edges.push({ id: uniqueId, originalId: id, source, target });
        return true;
    };

    findElements(doc, NS.bpmn, "sequenceFlow").forEach((flow, index) => {
        const flowId    = flow.getAttribute("id") || `SequenceFlow_${index}`;
        const sourceRef = flow.getAttribute("sourceRef");
        const targetRef = flow.getAttribute("targetRef");
        const source = sourceRef ? byOriginalId.get(sourceRef) : null;
        const target = targetRef ? byOriginalId.get(targetRef) : null;

        if (!source || !target) {
            droppedFlows.push({
                id: flowId,
                reason: !sourceRef || !targetRef
                    ? "missing source or target reference"
                    : "endpoint is not a process node"
            });
            return;
        }
        if (!addEdge(flowId, source, target)) {
            droppedFlows.push({
                id: flowId,
                reason: wouldCycle(source, target)
                    ? "would create a loop in the hierarchy"
                    : "duplicate link or second parent"
            });
        }
    });

    let nestedLinks = 0;
    byOriginalId.forEach(node => {
        if (node.parentId) return;
        let ancestor = node.element.parentElement;
        while (ancestor) {
            if (isActivityTag(ancestor.localName)) {
                const parent = byOriginalId.get(ancestor.getAttribute("id"));
                if (parent && parent.id !== node.id &&
                    addEdge(`SequenceFlow_nested_${nestedLinks}`, parent, node)) {
                    nestedLinks++;
                }
                break;
            }
            ancestor = ancestor.parentElement;
        }
    });

    return { edges, droppedFlows, nestedLinks };
}

// ── Layout ───────────────────────────────────────────────────────────────────

/**
 * Positions are only invented for nodes Prime left without a BPMNShape; nodes
 * that had bounds keep them, so the client recognises their own diagram.
 */
function layoutMissingBounds(nodes) {
    const placed = nodes.filter(n => n.bounds);
    let minX = 160;
    let minY = 100;
    let maxY = 100;

    if (placed.length) {
        minX = Math.min(...placed.map(n => n.bounds.x));
        minY = Math.min(...placed.map(n => n.bounds.y));
        maxY = Math.max(...placed.map(n => n.bounds.y + n.bounds.height));
    }

    const depthOf = node => {
        let depth = 0;
        let current = node;
        const guard = new Set();
        while (current.parentNode && !guard.has(current.id)) {
            guard.add(current.id);
            current = current.parentNode;
            depth++;
        }
        return depth;
    };

    const missing = nodes.filter(n => !n.bounds);
    let row = 0;
    missing.forEach(node => {
        node.bounds = {
            x: minX + depthOf(node) * (NODE_W + 60),
            y: maxY + 80 + row * (NODE_H + 30),
            width:  NODE_W,
            height: NODE_H
        };
        node.boundsGenerated = true;
        row++;
    });

    return { minX, minY, maxY, generatedCount: missing.length };
}

function routeEdge(source, target) {
    const sb = source.bounds;
    const tb = target.bounds;
    const sx = Math.round(sb.x + sb.width / 2);
    const sy = Math.round(sb.y + sb.height);
    const tx = Math.round(tb.x + tb.width / 2);
    const ty = Math.round(tb.y);

    if (sx === tx) return [{ x: sx, y: sy }, { x: tx, y: ty }];

    const mid = ty > sy ? Math.round((sy + ty) / 2) : sy + 30;
    return [
        { x: sx, y: sy },
        { x: sx, y: mid },
        { x: tx, y: mid },
        { x: tx, y: ty }
    ];
}

// ── Emit ─────────────────────────────────────────────────────────────────────

function buildXml(nodes, edges) {
    const shapes = nodes.map(node => `      <bpmndi:BPMNShape id="${node.id}_di" bpmnElement="${node.id}">
        <dc:Bounds x="${node.bounds.x}" y="${node.bounds.y}" width="${node.bounds.width}" height="${node.bounds.height}" />
      </bpmndi:BPMNShape>`).join("\n");

    const processNodes = nodes.map(node =>
        `    <bpmn:subProcess id="${node.id}" name="${escapeXml(node.name)}" process:processId="${escapeXml(node.processId)}" process:processName="${escapeXml(node.name)}" process:processType="${escapeXml(node.processType)}" />`
    ).join("\n");

    const flows = edges.map(edge =>
        `    <bpmn:sequenceFlow id="${edge.id}" sourceRef="${edge.source.id}" targetRef="${edge.target.id}" />`
    ).join("\n");

    const edgeDi = edges.map(edge => {
        const waypoints = edge.waypoints
            .map(p => `        <di:waypoint x="${Math.round(p.x)}" y="${Math.round(p.y)}" />`)
            .join("\n");
        return `      <bpmndi:BPMNEdge id="${edge.id}_di" bpmnElement="${edge.id}">
${waypoints}
      </bpmndi:BPMNEdge>`;
    }).join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                  xmlns:bpmn="${NS.bpmn}"
                  xmlns:bpmndi="${NS.bpmndi}"
                  xmlns:di="${NS.di}"
                  xmlns:dc="${NS.dc}"
                  xmlns:process="${NS.process}"
                  id="Definitions_1"
                  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
${processNodes}
${flows}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
${shapes}
${edgeDi}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Converts a Prime BPMN export into process-hierarchy XML this widget can load.
 *
 * Structure is copied as-is: no root is added, nothing is auto-connected.
 *
 * @param {string} xmlString raw file contents
 * @returns {{ xml: string, stats: object }}
 * @throws {Error} with a message safe to show the user
 */
export function transformPrimeProcessBpmn(xmlString) {
    if (!xmlString || !xmlString.trim()) {
        throw new Error("The selected file is empty.");
    }

    const doc = parseDocument(xmlString);
    const diBounds    = collectDiBounds(doc);
    const diWaypoints = collectDiWaypoints(doc);

    const { nodes, byOriginalId } = collectNodes(doc, diBounds);
    if (!nodes.length) {
        throw new Error("No processes found in the file. Expected BPMN tasks or sub-processes.");
    }

    const skippedFlowNodes = countSkippedFlowNodes(doc);
    const { edges, droppedFlows, nestedLinks } = collectEdges(doc, byOriginalId);

    const layout = layoutMissingBounds(nodes);

    // The import is a faithful copy: what the file contains is what appears on
    // the canvas. No root is invented and unconnected nodes are left
    // unconnected — Prime shows detached processes, so we do too. A root only
    // exists here if the file already had one (i.e. the file was exported by
    // this widget).
    const rootNode = nodes.find(n => n.isRoot && !n.parentId) || null;

    // Keep the original routing where both endpoints kept their original
    // positions; anything else gets a fresh orthogonal route.
    let generatedEdgeRoutes = 0;
    edges.forEach(edge => {
        const original = edge.originalId ? diWaypoints.get(edge.originalId) : null;
        const movedEndpoint = edge.source.boundsGenerated || edge.target.boundsGenerated;
        if (original && !movedEndpoint) {
            edge.waypoints = original;
        } else {
            edge.waypoints = routeEdge(edge.source, edge.target);
            generatedEdgeRoutes++;
        }
    });

    // Reported so the user can see the file had detached processes rather than
    // wondering whether the import lost their links.
    const unconnected = nodes.filter(n => n !== rootNode && !n.parentId && !n.children.length);

    return {
        xml: buildXml(nodes, edges),
        stats: {
            processCount:         nodes.length,
            valueChainCount:      nodes.filter(n => n.processType === "valuechain").length,
            linkCount:            edges.length,
            hasRoot:              Boolean(rootNode),
            unconnectedCount:     unconnected.length,
            nestedLinks,
            generatedPositions:   layout.generatedCount,
            generatedEdgeRoutes,
            droppedFlowCount:     droppedFlows.length,
            droppedFlows,
            skippedFlowNodes
        }
    };
}

export default { transformPrimeProcessBpmn };
