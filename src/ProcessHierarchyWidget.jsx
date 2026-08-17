import { createElement, useEffect, useRef, useCallback, useState } from "react";
import BpmnModeler from "bpmn-js/lib/Modeler";
import { is } from "bpmn-js/lib/util/ModelUtil";
import "./ui/ProcessHierarchyWidget.css";
import downloadIcon from "./assets/download-svgrepo-com.svg";
import importIcon   from "./assets/import-svgrepo-com.svg";
import saveIcon     from "./assets/save-svgrepo-com.svg";
import undoIcon     from "./assets/undo-svgrepo-com.svg";
import redoIcon     from "./assets/redo-svgrepo-com.svg";
import { transformPrimeProcessBpmn } from "./components/PrimeProcessBpmnImporter";

// ── Toggle button colours ─────────────────────────────────────────────────────
const TOGGLE_BG_EXPANDED  = "#2cb5b5";
const TOGGLE_BG_COLLAPSED = "#e07b3a";
const TOGGLE_SIZE         = 22;

export function ProcessHierarchyWidget(props) {
    const {
        processXML,
        libraryName,
        clickedProcessId,
        onProcessClick,
        onSaveXML,
        readOnly,
        currentUserEmail,
        lockedUserEmail
    } = props;

    const containerRef       = useRef(null);
    const modelerRef         = useRef(null);
    const lastImportedXmlRef = useRef(null);
    const actionRef          = useRef(null);
    const [pendingProcessId, setPendingProcessId] = useState(null);

    // Import: hidden file input + the parsed-but-not-yet-applied candidate.
    const fileInputRef = useRef(null);
    const [pendingImport, setPendingImport] = useState(null);

    // Collapse state: Map<elementId, boolean> — true = collapsed
    const collapseStateRef = useRef(new Map());

    // ── Lock check ────────────────────────────────────────────────────────────
    const isLockedByAnotherUser = useCallback(() => {
        if (currentUserEmail?.status === "loading" ||
            lockedUserEmail?.status === "loading") return true;
        if (!lockedUserEmail?.value || !lockedUserEmail.value.trim()) return true;
        if (!currentUserEmail?.value || !currentUserEmail.value.trim()) return true;
        return currentUserEmail.value.toLowerCase().trim() !==
               lockedUserEmail.value.toLowerCase().trim();
    }, [currentUserEmail?.value, currentUserEmail?.status,
        lockedUserEmail?.value,  lockedUserEmail?.status]);

    const isReadOnly = readOnly || isLockedByAnotherUser();

    // ── Default XML ───────────────────────────────────────────────────────────
    const generateDefaultXML = (name) => {
        const n = name || "Library Root";
        return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:process="http://lowcodelabs/schema/process"
                  id="Definitions_1"
                  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:subProcess id="SubProcess_Root" name="${n}"
                     process:processId="root"
                     process:processName="${n}"
                     process:processType="process">
    </bpmn:subProcess>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="SubProcess_Root_di" bpmnElement="SubProcess_Root">
        <dc:Bounds x="200" y="100" width="100" height="80"/>
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
    };

    // ── Collapse helpers ──────────────────────────────────────────────────────
    function getDirectChildren(element) {
        return (element.outgoing || [])
            .filter(c => c.type === "bpmn:SequenceFlow")
            .map(c => c.target)
            .filter(Boolean);
    }

    function collectDescendants(element, collapseState) {
        const nodeIds       = new Set();
        const connectionIds = new Set();
        const queue         = [...getDirectChildren(element)];
        while (queue.length) {
            const child = queue.shift();
            if (!child || nodeIds.has(child.id)) continue;
            nodeIds.add(child.id);
            (child.incoming || [])
                .filter(c => c.type === "bpmn:SequenceFlow")
                .forEach(c => connectionIds.add(c.id));
            if (!collapseState.get(child.id)) {
                queue.push(...getDirectChildren(child));
            }
        }
        return { nodeIds, connectionIds };
    }

    function setElementVisibility(container, elementId, visible) {
        const gfx = container.querySelector(`[data-element-id="${elementId}"]`);
        if (gfx) gfx.style.display = visible ? "" : "none";
    }

    function setOverlayVisibility(container, elementId, visible) {
        // Search in the full bpmn container including overlay layer
        const searchRoot = container.closest(".bjs-container") || container;
        const btn = searchRoot.querySelector(
            `button[data-collapse-id="${elementId}"]`
        );
        if (btn) {
            const overlayDiv = btn.closest(".djs-overlay");
            if (overlayDiv) overlayDiv.style.display = visible ? "" : "none";
        }
    }

    // ── Build toggle button (HTML element) ────────────────────────────────────
    const buildToggleButton = (elementId, isCollapsed, childCount) => {
        const btn  = document.createElement("button");
        btn.setAttribute("data-collapse-id", elementId);
        const bg   = isCollapsed ? TOGGLE_BG_COLLAPSED : TOGGLE_BG_EXPANDED;
        const icon = isCollapsed ? `▶ ${childCount}` : "▼";
        btn.style.cssText = `
            width: ${TOGGLE_SIZE}px;
            height: ${TOGGLE_SIZE}px;
            border-radius: 50%;
            border: 2px solid #ffffff;
            background: ${bg};
            color: #ffffff;
            font-size: ${isCollapsed ? "7px" : "10px"};
            font-weight: 700;
            font-family: Arial, sans-serif;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0;
            line-height: 1;
            box-shadow: 0 1px 4px rgba(0,0,0,0.25);
            transition: opacity 0.15s;
            pointer-events: all;
        `;
        btn.textContent = icon;
        btn.addEventListener("mouseenter", () => { btn.style.opacity = "0.8"; });
        btn.addEventListener("mouseleave", () => { btn.style.opacity = "1"; });
        return btn;
    };

    // ── Refresh overlay toggle buttons ────────────────────────────────────────
const refreshOverlays = useCallback((modeler) => {
    if (!modeler) return;
    const overlays        = modeler.get("overlays");
    const elementRegistry = modeler.get("elementRegistry");
    const collapseState   = collapseStateRef.current;

    try { overlays.remove({ type: "collapse-toggle" }); } catch (_) {}

    // Build a set of all element IDs that are currently hidden
    // by walking every collapsed node's descendants
    const hiddenIds = new Set();
    elementRegistry.getAll().forEach(element => {
        if (collapseState.get(element.id) === true) {
            const { nodeIds } = collectDescendants(element, collapseState);
            nodeIds.forEach(id => hiddenIds.add(id));
        }
    });

    elementRegistry.getAll().forEach(element => {
        if (element.type !== "bpmn:SubProcess") return;
        if (!element.businessObject.get("process:processId")) return;

        const children = getDirectChildren(element);
        if (children.length === 0) return;

        // Skip — this node is hidden inside a collapsed parent
        if (hiddenIds.has(element.id)) return;

        const isCollapsed = collapseState.get(element.id) === true;
        const btn = buildToggleButton(element.id, isCollapsed, children.length);

        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            handleToggleCollapse(element.id, modeler);
        });

        overlays.add(element.id, "collapse-toggle", {
            position: {
                bottom: 4,
                left:   element.width / 2 - TOGGLE_SIZE / 2
            },
            html: btn
        });
    });
}, []);

    // ── Core collapse / expand ────────────────────────────────────────────────
    const handleToggleCollapse = useCallback((elementId, modeler) => {
        const mod = modeler || modelerRef.current;
        if (!mod) return;

        const elementRegistry = mod.get("elementRegistry");
        const container       = containerRef.current;
        const collapseState   = collapseStateRef.current;

        const element = elementRegistry.get(elementId);
        if (!element) return;

        const wasCollapsed = collapseState.get(elementId) === true;
        const nowCollapsed = !wasCollapsed;
        collapseState.set(elementId, nowCollapsed);

        if (nowCollapsed) {
            const { nodeIds, connectionIds } = collectDescendants(element, collapseState);
            nodeIds.forEach(id => {
                setElementVisibility(container, id, false);
                setOverlayVisibility(container, id, false);
            });
            connectionIds.forEach(id => setElementVisibility(container, id, false));
            (element.outgoing || [])
                .filter(c => c.type === "bpmn:SequenceFlow")
                .forEach(c => setElementVisibility(container, c.id, false));
        } else {
            // Expand — show only direct children, respect grandchildren's own state
            const restoreDescendants = (el) => {
                const children = getDirectChildren(el);
                children.forEach(child => {
                    setElementVisibility(container, child.id, true);
                    (child.incoming || [])
                        .filter(c => c.type === "bpmn:SequenceFlow" && c.source?.id === el.id)
                        .forEach(c => setElementVisibility(container, c.id, true));
                    setOverlayVisibility(container, child.id, true);
                    if (!collapseState.get(child.id)) {
                        restoreDescendants(child);
                    }
                });
            };

            restoreDescendants(element);

            (element.outgoing || [])
                .filter(c => c.type === "bpmn:SequenceFlow")
                .forEach(c => setElementVisibility(container, c.id, true));
        }

        // Refresh overlay buttons to reflect new state
        refreshOverlays(mod);
    }, [refreshOverlays]);

    // ── Pending navigation ────────────────────────────────────────────────────
    useEffect(() => {
        if (pendingProcessId &&
            clickedProcessId &&
            clickedProcessId.status === "available") {

            console.info("Setting pending process ID:", pendingProcessId);
            clickedProcessId.setValue(pendingProcessId);

            setTimeout(() => {
                if (actionRef.current && actionRef.current.canExecute) {
                    console.info("Executing action for process:", pendingProcessId);
                    actionRef.current.execute();
                }
                setPendingProcessId(null);
            }, 100);
        }
    }, [pendingProcessId, clickedProcessId?.status]);

    useEffect(() => {
        actionRef.current = onProcessClick;
    }, [onProcessClick]);

    // ── Modeler init ──────────────────────────────────────────────────────────
    useEffect(() => {
        if (!containerRef.current) return;

        // Reset collapse state on every modeler re-init
        collapseStateRef.current = new Map();

        if (modelerRef.current) {
            modelerRef.current.destroy();
            modelerRef.current = null;
        }

        const modeler = new BpmnModeler({
            container: containerRef.current,
            additionalModules: [
                require("./components/CustomPaletteProvider"),
                require("./components/CustomProcessPalette"),
                require("./components/CustomProcessRenderer"),
                require("./components/CustomProcessRules"),
                require("./components/CustomProcessContextPad"),
                require("./components/CustomProcessNameSync"),
                require("./components/CustomProcessAutoPlace")
            ],
            moddleExtensions: {
                process: require("./components/processModdle").processModdle
            }
        });

        modelerRef.current = modeler;

        const xmlToLoad = processXML?.value || generateDefaultXML(libraryName?.value);
        lastImportedXmlRef.current = xmlToLoad;

        modeler
            .importXML(xmlToLoad)
            .then(({ warnings }) => {
                if (warnings.length) {
                    console.warn("BPMN Import Warnings:", warnings);
                }

                const canvas   = modeler.get("canvas");
                const eventBus = modeler.get("eventBus");
                canvas.zoom("fit-viewport");

                // Draw overlay toggle buttons for all nodes with children
                refreshOverlays(modeler);

                // Re-draw overlays whenever diagram structure changes
                eventBus.on("elements.changed",  () => refreshOverlays(modeler));
                eventBus.on("shape.added",        () => refreshOverlays(modeler));
                eventBus.on("connection.added",   () => refreshOverlays(modeler));
                eventBus.on("shape.removed",      () => refreshOverlays(modeler));
                eventBus.on("connection.removed", () => refreshOverlays(modeler));

                // Disable editing if locked
                if (isReadOnly) {
                    eventBus.on("commandStack.execute", 10000, (event) => {
                        event.stopPropagation();
                        return false;
                    });
                }

                eventBus.on("process.unsaved-warning", () => {
                    showUnsavedWarning();
                });

                eventBus.on("process.open", (event) => {
                    const processId = event?.processId;
                    if (!processId) return;
                    console.info("Context pad → Go to Process:", processId);
                    setPendingProcessId(processId);
                });

                // Appending onto a collapsed node would drop the new child into
                // a hidden row — expand first so it is visible where it lands.
                eventBus.on("process.ensure-expanded", (event) => {
                    if (collapseStateRef.current.get(event.elementId) === true) {
                        handleToggleCollapse(event.elementId, modeler);
                    }
                });

                eventBus.on("element.dblclick", (event) => {
                    const { element } = event;

                    if (is(element, "bpmn:SubProcess") &&
                        element.businessObject.get("process:processId")) {

                        if (!isReadOnly) {
                            const directEditing = modeler.get("directEditing");
                            directEditing.activate(element);
                            return;
                        }

                        event.stopPropagation();
                        event.preventDefault();

                        const directEditing = modeler.get("directEditing");
                        directEditing.cancel();

                        const processId = element.businessObject.get("process:processId");
                        console.info("Process double-clicked (read-only):", processId);
                        setPendingProcessId(processId);
                    }
                });
            })
            .catch(err => {
                console.error("Error importing BPMN diagram:", err);
            });

        return () => {
            if (modelerRef.current) {
                modelerRef.current.destroy();
            }
        };
    }, [isReadOnly]);

    // ── Library name update ───────────────────────────────────────────────────
    useEffect(() => {
        if (!modelerRef.current) return;
        if (!libraryName?.value) return;
        if (processXML?.value) return;

        const elementRegistry = modelerRef.current.get("elementRegistry");
        const modeling        = modelerRef.current.get("modeling");
        const rootElement     = elementRegistry.get("SubProcess_Root");

        if (rootElement) {
            modeling.updateProperties(rootElement, {
                name: libraryName.value,
                "process:processName": libraryName.value
            });
        }
    }, [libraryName?.value, processXML?.value]);

    // ── XML updates from Mendix ───────────────────────────────────────────────
    useEffect(() => {
        if (!modelerRef.current) return;
        if (!processXML?.value) return;
        if (processXML.value === lastImportedXmlRef.current) return;

        console.log("Importing new process hierarchy XML");
        lastImportedXmlRef.current = processXML.value;

        // Reset collapse state when fresh XML is loaded
        collapseStateRef.current = new Map();

        modelerRef.current
            .importXML(processXML.value)
            .then(() => {
                const canvas = modelerRef.current.get("canvas");
                canvas.zoom("fit-viewport");
                refreshOverlays(modelerRef.current);
            })
            .catch(err => {
                console.error("Error updating BPMN diagram:", err);
            });
    }, [processXML?.value]);

    // ── Validation ────────────────────────────────────────────────────────────
    const validateDiagram = useCallback(() => {
        if (!modelerRef.current) return { valid: true, errors: [] };

        const elementRegistry = modelerRef.current.get("elementRegistry");
        const errors          = [];

        elementRegistry.getAll().forEach(element => {
            if (is(element, "bpmn:SubProcess") &&
                element.businessObject.get("process:processId")) {
                if ((element.incoming || []).length > 1) {
                    errors.push("A process must not have more than one parent process.");
                }
            }
        });

        return { valid: errors.length === 0, errors };
    }, []);

    // ── Save ──────────────────────────────────────────────────────────────────
    const exportAndSaveXML = useCallback(() => {
        if (!modelerRef.current || !onSaveXML || !onSaveXML.canExecute) return;
        if (isReadOnly) return;

        const validation = validateDiagram();
        if (!validation.valid) {
            showValidationError(validation.errors);
            return;
        }

        modelerRef.current
            .saveXML({ format: true })
            .then(({ xml }) => {
                processXML?.setValue(xml);
                onSaveXML.execute();
            })
            .catch(err => {
                console.error("Error exporting BPMN XML:", err);
            });
    }, [processXML, onSaveXML, validateDiagram, isReadOnly]);

    // ── Validation overlay ────────────────────────────────────────────────────
    const showValidationError = useCallback((errors) => {
        if (!containerRef.current) return;

        containerRef.current.querySelectorAll(".validation-error-overlay")
            .forEach(e => e.remove());

        const overlay     = document.createElement("div");
        overlay.className = "validation-error-overlay";

        const errorHeader     = document.createElement("div");
        errorHeader.className = "validation-error-header";
        errorHeader.innerHTML = `<span class="icon">⚠️</span><span>Alert</span>`;

        const errorContent     = document.createElement("div");
        errorContent.className = "validation-error-content";
        errors.forEach(error => {
            const errorLine = document.createElement("div");
            errorLine.textContent       = error;
            errorLine.style.marginBottom = "8px";
            errorContent.appendChild(errorLine);
        });

        const closeButton     = document.createElement("button");
        closeButton.className = "validation-error-close";
        closeButton.innerHTML = "×";

        overlay.appendChild(closeButton);
        overlay.appendChild(errorHeader);
        overlay.appendChild(errorContent);
        containerRef.current.appendChild(overlay);

        const timeout = setTimeout(() => overlay.remove(), 4000);
        closeButton.onclick = () => { clearTimeout(timeout); overlay.remove(); };
    }, []);

    // ── Undo / Redo ───────────────────────────────────────────────────────────
    const handleUndo = useCallback(() => {
        if (!modelerRef.current || isReadOnly) return;
        const commandStack = modelerRef.current.get("commandStack");
        if (commandStack.canUndo()) commandStack.undo();
    }, [isReadOnly]);

    const handleRedo = useCallback(() => {
        if (!modelerRef.current || isReadOnly) return;
        const commandStack = modelerRef.current.get("commandStack");
        if (commandStack.canRedo()) commandStack.redo();
    }, [isReadOnly]);

    // ── Unsaved warning ───────────────────────────────────────────────────────
    const showUnsavedWarning = () => {
        if (!containerRef.current) return;
        const overlay     = document.createElement("div");
        overlay.className = "validation-error-overlay";
        overlay.innerHTML = `
            <div class="validation-error-header">
                <span>⚠️ Unsaved Changes</span>
            </div>
            <div class="validation-error-content">
                Please save the library before opening a processmap.
            </div>
        `;
        containerRef.current.appendChild(overlay);
        setTimeout(() => overlay.remove(), 5000);
    };

    // ── Download BPMN ─────────────────────────────────────────────────────────
    const downloadBPMN = useCallback(() => {
        if (!modelerRef.current) return;

        modelerRef.current
            .saveXML({ format: true })
            .then(({ xml }) => {
                const blob = new Blob([xml], { type: "application/bpmn+xml" });
                const url  = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href  = url;
                link.download = libraryName?.value
                    ? `${libraryName.value.replace(/\s+/g, "_")}_Process_Hierarchy.bpmn`
                    : "Process_Hierarchy.bpmn";
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            })
            .catch(err => {
                console.error("Error downloading BPMN:", err);
            });
    }, [libraryName]);

    // ── Info overlay (import results) ─────────────────────────────────────────
    const showInfoOverlay = useCallback((title, lines, timeout = 6000) => {
        if (!containerRef.current) return;
        containerRef.current.querySelectorAll(".validation-error-overlay")
            .forEach(e => e.remove());

        const overlay     = document.createElement("div");
        overlay.className = "validation-error-overlay info";

        const header      = document.createElement("div");
        header.className  = "validation-error-header";
        header.innerHTML  = `<span class="icon">✓</span><span></span>`;
        header.lastChild.textContent = title;

        const content     = document.createElement("div");
        content.className = "validation-error-content";
        lines.forEach(text => {
            const line = document.createElement("div");
            line.textContent        = text;
            line.style.marginBottom = "4px";
            content.appendChild(line);
        });

        const close       = document.createElement("button");
        close.className   = "validation-error-close";
        close.innerHTML   = "×";

        overlay.appendChild(close);
        overlay.appendChild(header);
        overlay.appendChild(content);
        containerRef.current.appendChild(overlay);

        const t = setTimeout(() => overlay.remove(), timeout);
        close.onclick = () => { clearTimeout(t); overlay.remove(); };
    }, []);

    // ── Import BPMN ───────────────────────────────────────────────────────────
    const handleImportClick = useCallback(() => {
        if (isReadOnly) return;
        // Reset value so re-picking the same file still fires change.
        if (fileInputRef.current) fileInputRef.current.value = "";
        fileInputRef.current?.click();
    }, [isReadOnly]);

    const handleFileSelected = useCallback((event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onerror = () => showValidationError(["Could not read the selected file."]);
        reader.onload  = () => {
            try {
                const { xml, stats } = transformPrimeProcessBpmn(String(reader.result));
                setPendingImport({ fileName: file.name, xml, stats });
            } catch (err) {
                showValidationError([err.message || "Could not import this BPMN file."]);
            }
        };
        reader.readAsText(file);
    }, [showValidationError]);

    const applyImport = useCallback(() => {
        const candidate = pendingImport;
        if (!candidate || !modelerRef.current) return;
        setPendingImport(null);

        collapseStateRef.current = new Map();
        // Keep the ref pointing at what is actually on the canvas, so the
        // Mendix-XML effect does not treat the old value as a fresh update and
        // re-import over the file the user just brought in.
        lastImportedXmlRef.current = candidate.xml;

        modelerRef.current
            .importXML(candidate.xml)
            .then(({ warnings }) => {
                if (warnings.length) console.warn("BPMN Import Warnings:", warnings);
                modelerRef.current.get("canvas").zoom("fit-viewport");
                refreshOverlays(modelerRef.current);

                const s     = candidate.stats;
                const lines = [
                    `${s.processCount} nodes and ${s.linkCount} links loaded.`
                ];
                if (s.valueChainCount) {
                    lines.push(`${s.valueChainCount} of them ${s.valueChainCount === 1 ? "is a value chain" : "are value chains"}.`);
                }
                if (s.unconnectedCount) {
                    lines.push(`${s.unconnectedCount} ${s.unconnectedCount === 1 ? "node is" : "nodes are"} not connected to anything — link ${s.unconnectedCount === 1 ? "it" : "them"} as needed.`);
                }
                if (s.generatedPositions) {
                    lines.push(`${s.generatedPositions} ${s.generatedPositions === 1 ? "node" : "nodes"} had no saved position and were placed below the diagram.`);
                }
                if (s.droppedFlowCount) {
                    lines.push(`${s.droppedFlowCount} incomplete ${s.droppedFlowCount === 1 ? "connector was" : "connectors were"} skipped.`);
                }
                if (s.skippedFlowNodes) {
                    lines.push(`${s.skippedFlowNodes} events/gateways were skipped — a process hierarchy holds processes only.`);
                }
                lines.push("Press Save to keep this import.");

                showInfoOverlay("Import complete", lines, 12000);
            })
            .catch(err => {
                console.error("Error importing BPMN diagram:", err);
                showValidationError([
                    "The file could not be loaded onto the canvas.",
                    err.message || "Unknown error."
                ]);
            });
    }, [pendingImport, refreshOverlays, showInfoOverlay, showValidationError]);

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div
            className="process-hierarchy-widget"
            data-locked={isLockedByAnotherUser()}
            data-readonly={isReadOnly}
        >
            <div className="process-hierarchy-header">
                <h3>{libraryName?.value || "Process Hierarchy"}</h3>

                <div className="header-buttons">
                    {!isReadOnly && (
                        <div className="editable-buttons">
                            <button className="btn-save" onClick={exportAndSaveXML}>
                                <span>
                                    <img src={saveIcon} alt="SaveProcess" style={{ width: "18px", height: "18px" }} />
                                    Save
                                </span>
                            </button>
                            <button className="btn-change" onClick={handleImportClick} title="Import BPMN">
                                <span>
                                    <img src={importIcon} alt="Import" style={{ width: "16px", height: "16px", position: "relative", top: "-1px" }} />
                                    Import BPMN
                                </span>
                            </button>
                            <button className="btn-change" onClick={handleUndo} title="Undo">
                                <img src={undoIcon} alt="Undo Changes" style={{ width: "16px", height: "16px" }} />
                            </button>
                            <button className="btn-change" onClick={handleRedo} title="Redo">
                                <img src={redoIcon} alt="Redo Changes" style={{ width: "16px", height: "16px" }} />
                            </button>
                        </div>
                    )}

                    <button className="btn-download" onClick={downloadBPMN}>
                        <span>
                            <img src={downloadIcon} alt="DownloadBPMN" style={{ width: "18px", height: "18px" }} />
                            Download BPMN
                        </span>
                    </button>
                </div>
            </div>

            <div
                ref={containerRef}
                className="bpmn-process-container"
                style={{
                    height:          "600px",
                    width:           "100%",
                    border:          "1px solid #dde1ea",
                    backgroundColor: "#eef0f5",
                    opacity:         isLockedByAnotherUser() ? 0.7 : 1
                }}
            />

            <input
                ref={fileInputRef}
                type="file"
                accept=".bpmn,.xml,text/xml,application/xml"
                style={{ display: "none" }}
                onChange={handleFileSelected}
            />

            {pendingImport && (
                <div className="import-confirm-backdrop">
                    <div className="import-confirm">
                        <div className="import-confirm-title">Replace current hierarchy?</div>
                        <div className="import-confirm-body">
                            <div className="import-confirm-file">{pendingImport.fileName}</div>
                            <div>
                                Found {pendingImport.stats.processCount} nodes
                                and {pendingImport.stats.linkCount} links.
                            </div>
                            <div className="import-confirm-warn">
                                This replaces everything currently on the canvas and cannot be
                                undone. Nothing is written to the library until you press Save,
                                so leaving the page without saving keeps the existing hierarchy.
                            </div>
                        </div>
                        <div className="import-confirm-actions">
                            <button className="import-btn-cancel" onClick={() => setPendingImport(null)}>
                                Cancel
                            </button>
                            <button className="import-btn-confirm" onClick={applyImport}>
                                Import
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}