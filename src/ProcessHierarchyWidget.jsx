import { createElement, useEffect, useRef, useCallback, useState} from "react";
import BpmnModeler from "bpmn-js/lib/Modeler";
import { is } from "bpmn-js/lib/util/ModelUtil";
import "./ui/ProcessHierarchyWidget.css";
import downloadIcon from "./assets/download-svgrepo-com.svg"
import saveIcon from "./assets/save-svgrepo-com.svg"
import undoIcon from "./assets/undo-svgrepo-com.svg"
import redoIcon from "./assets/redo-svgrepo-com.svg"

export function ProcessHierarchyWidget(props) {
    const {
        processXML,
        libraryName,
        clickedProcessId,
        onProcessClick,
        onSaveXML,
        readOnly,
        currentUserEmail,      // ⭐ ADD
        lockedUserEmail        // ⭐ ADD
    } = props;

    const containerRef = useRef(null);
    const modelerRef = useRef(null);
    const lastImportedXmlRef = useRef(null);
    const actionRef = useRef(null); 
    const [pendingProcessId, setPendingProcessId] = useState(null);
    // const initialSaveDoneRef = useRef(false);

 const isLockedByAnotherUser = useCallback(() => {
    // Wait for values to load
    if (currentUserEmail?.status === "loading" || 
        lockedUserEmail?.status === "loading") {
        return true; // Block while loading
    }

    // ✅ NEW LOGIC: If no one is checked out (empty), EVERYONE is read-only
    if (!lockedUserEmail?.value || !lockedUserEmail.value.trim()) {
        return true; // No checkout = read-only for all
    }
    
    // If current user email not available, block
    if (!currentUserEmail?.value || !currentUserEmail.value.trim()) {
        return true;
    }
    
    // Compare emails - only the checked-out user can edit
    const currentEmail = currentUserEmail.value.toLowerCase().trim();
    const lockedEmail = lockedUserEmail.value.toLowerCase().trim();
    
    // If current user IS the checked-out user, they can edit
    return currentEmail !== lockedEmail;
}, [currentUserEmail?.value, currentUserEmail?.status, 
    lockedUserEmail?.value, lockedUserEmail?.status]);
    // ⭐ ADD: Computed readonly state
    const isReadOnly = readOnly || isLockedByAnotherUser();

    const generateDefaultXML = (name) => {
        const libraryNameValue = name || "Library Root";
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
    <bpmn:subProcess id="SubProcess_Root" name="${libraryNameValue}" 
                     process:processId="root" 
                     process:processName="${libraryNameValue}"
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

    useEffect(() => {
        if (pendingProcessId && 
            clickedProcessId && 
            clickedProcessId.status === "available") {
            
            console.info('Setting pending process ID:', pendingProcessId);
            clickedProcessId.setValue(pendingProcessId);
            
            setTimeout(() => {
                if (actionRef.current && actionRef.current.canExecute) {
                    console.info('Executing action for process:', pendingProcessId);
                    actionRef.current.execute();
                }
                setPendingProcessId(null);
            }, 100);
        }
    }, [pendingProcessId, clickedProcessId?.status]);

    useEffect(() => {
        actionRef.current = onProcessClick;
    }, [onProcessClick]);

    useEffect(() => {
        if (!containerRef.current) return;

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
                require("./components/CustomProcessContextPad")
            ],
            moddleExtensions: {
                process: require("./components/processModdle").processModdle
            }
        });

        modelerRef.current = modeler;

        const isFirstTimeLoad = !processXML?.value || processXML.value.trim() === '';
        const xmlToLoad = processXML?.value || generateDefaultXML(libraryName?.value);
        lastImportedXmlRef.current = xmlToLoad;

        modeler
            .importXML(xmlToLoad)
            .then(({ warnings }) => {
                if (warnings.length) {
                    console.warn("BPMN Import Warnings:", warnings);
                }

                const canvas = modeler.get("canvas");
                canvas.zoom("fit-viewport");
                // // ⭐ AUTO-SAVE: If this is the first load and XML was generated (not loaded)
                // if (isFirstTimeLoad && 
                //     !initialSaveDoneRef.current && 
                //     onSaveXML && 
                //     onSaveXML.canExecute) {
                    
                //     console.info("First time load - auto-saving initial process hierarchy XML");
                    
                //     modeler.saveXML({ format: true })
                //         .then(({ xml }) => {
                //             processXML?.setValue(xml);
                //             onSaveXML.execute();
                //             initialSaveDoneRef.current = true; // Mark as saved
                //             console.info("Initial process hierarchy XML auto-saved successfully");
                //         })
                //         .catch(err => {
                //             console.error("Error auto-saving initial XML:", err);
                //         });
                // }

                // ⭐ ADD: Disable editing if locked
                if (isReadOnly) {
                    const eventBus = modeler.get('eventBus');
                    
                    eventBus.on('commandStack.execute', 10000, (event) => {
                        if (isReadOnly) {
                            event.stopPropagation();
                            return false;
                        }
                    });
                }

                const eventBus = modeler.get("eventBus");

                // ⭐ Unsaved warning
                eventBus.on('process.unsaved-warning', () => {
                    showUnsavedWarning();
                });
                // ⭐ Context pad navigation
                eventBus.on('process.open', (event) => {
                    const processId = event?.processId;

                    if (!processId) return;

                    console.info("Context pad → Go to Process:", processId);
                    setPendingProcessId(processId);
                });
                
                // ⭐ UPDATED: Double-click behavior
                eventBus.on("element.dblclick", (event) => {
                    const { element } = event;
                    
                    if (is(element, "bpmn:SubProcess") && 
                        element.businessObject.get("process:processId")) {

                        // If user CAN edit, allow inline editing
                        if (!isReadOnly) {
                            const directEditing = modeler.get("directEditing");
                            directEditing.activate(element);
                            return;
                        }

                        // If user CANNOT edit, navigate
                        event.stopPropagation();
                        event.preventDefault();
                        
                        const directEditing = modeler.get("directEditing");
                        directEditing.cancel();
                        
                        const processId = element.businessObject.get("process:processId");
                        console.info('Process double-clicked (read-only):', processId);
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
    }, [isReadOnly]); // ⭐ ADD: dependency

    useEffect(() => {
        if (!modelerRef.current) return;
        if (!libraryName?.value) return;
        if (processXML?.value) return;

        const elementRegistry = modelerRef.current.get('elementRegistry');
        const modeling = modelerRef.current.get('modeling');
        const rootElement = elementRegistry.get('SubProcess_Root');
        
        if (rootElement) {
            modeling.updateProperties(rootElement, {
                name: libraryName.value,
                'process:processName': libraryName.value
            });
        }
    }, [libraryName?.value, processXML?.value]);

    useEffect(() => {
        if (!modelerRef.current) return;
        if (!processXML?.value) return;

        if (processXML.value === lastImportedXmlRef.current) {
            return;
        }

        console.log("Importing new process hierarchy XML");
        lastImportedXmlRef.current = processXML.value;

        modelerRef.current
            .importXML(processXML.value)
            .then(() => {
                const canvas = modelerRef.current.get("canvas");
                canvas.zoom("fit-viewport");
            })
            .catch(err => {
                console.error("Error updating BPMN diagram:", err);
            });
    }, [processXML?.value]);

    const validateDiagram = useCallback(() => {
        if (!modelerRef.current) return { valid: true, errors: [] };

        const elementRegistry = modelerRef.current.get('elementRegistry');
        const errors = [];
        const allElements = elementRegistry.getAll();
        
        allElements.forEach(element => {
            if (is(element, 'bpmn:SubProcess') && 
                element.businessObject.get('process:processId')) {
                
                const incomingCount = element.incoming ? element.incoming.length : 0;
                
                if (incomingCount > 1) {
                    errors.push("A process must not have more than one parent process.");
                }
            }
        });
        
        return {
            valid: errors.length === 0,
            errors: errors
        };
    }, []);

    const exportAndSaveXML = useCallback(() => {
        if (!modelerRef.current || !onSaveXML || !onSaveXML.canExecute) return;
        if (isReadOnly) return; // ⭐ ADD

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
    }, [processXML, onSaveXML, validateDiagram, isReadOnly]); // ⭐ ADD dependency

    const showValidationError = useCallback((errors) => {
        if (!containerRef.current) return;
        
        const existingErrors = containerRef.current.querySelectorAll('.validation-error-overlay');
        existingErrors.forEach(error => error.remove());
        
        const overlay = document.createElement('div');
        overlay.className = 'validation-error-overlay';
        
        const errorHeader = document.createElement('div');
        errorHeader.className = 'validation-error-header';
        errorHeader.innerHTML = `
            <span class="icon">⚠️</span>
            <span>Alert</span>
        `;
        
        const errorContent = document.createElement('div');
        errorContent.className = 'validation-error-content';
        errors.forEach(error => {
            const errorLine = document.createElement('div');
            errorLine.textContent = error;
            errorLine.style.marginBottom = '8px';
            errorContent.appendChild(errorLine);
        });
        
        const closeButton = document.createElement('button');
        closeButton.className = 'validation-error-close';
        closeButton.innerHTML = '×';
        
        overlay.appendChild(closeButton);
        overlay.appendChild(errorHeader);
        overlay.appendChild(errorContent);
        
        containerRef.current.appendChild(overlay);

        const timeout = setTimeout(() => {
            overlay.remove();
        }, 4000);
        
        closeButton.onclick = () => {
            clearTimeout(timeout);
            overlay.remove();
        };
    }, []);

    const handleUndo = useCallback(() => {
        if (!modelerRef.current || isReadOnly) return; // ⭐ ADD check
        const commandStack = modelerRef.current.get('commandStack');
        if (commandStack.canUndo()) {
            commandStack.undo();
        }
    }, [isReadOnly]); // ⭐ ADD dependency

    const handleRedo = useCallback(() => {
        if (!modelerRef.current || isReadOnly) return; // ⭐ ADD check
        const commandStack = modelerRef.current.get('commandStack');
        if (commandStack.canRedo()) {
            commandStack.redo();
        }
    }, [isReadOnly]); // ⭐ ADD dependency

    const showUnsavedWarning = () => {
        if (!containerRef.current) return;

        const overlay = document.createElement("div");
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

        setTimeout(() => {
            overlay.remove();
        }, 5000);
    };

    const downloadBPMN = useCallback(() => {
        if (!modelerRef.current) return;

        modelerRef.current
            .saveXML({ format: true })
            .then(({ xml }) => {
                const blob = new Blob([xml], { type: 'application/bpmn+xml' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                
                const fileName = libraryName?.value 
                    ? `${libraryName.value.replace(/\s+/g, '_')}_Process_Hierarchy.bpmn`
                    : 'Process_Hierarchy.bpmn';
                
                link.download = fileName;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            })
            .catch(err => {
                console.error("Error downloading BPMN:", err);
            });
    }, [libraryName]);

return (
    <div className="process-hierarchy-widget" data-locked={isLockedByAnotherUser()}>
        <div className="process-hierarchy-header">
            <h3>{libraryName?.value || "Process Hierarchy"}</h3>
            
            <div className="header-buttons">
                {!isReadOnly && (
                    <div className="editable-buttons">
                        <button 
                            className="btn-save"
                            onClick={exportAndSaveXML}
                        >
                            <span>
                                <img src={saveIcon} alt="SaveProcess" style={{width:'18px',height:'18px'}}></img>
                                Save
                            </span>
                        </button>
                        <button
                           className="btn-change"
                           onClick={handleUndo}
                           title="Undo"
                        >
                            <img src={undoIcon} alt="Undo Changes" style={{width:'16px', height:'16px'}}/>
                        </button>

                        <button
                           className="btn-change"
                           onClick={handleRedo}
                           title="Redo"
                        >
                            <img src={redoIcon} alt="Redo Changes" style={{width:'16px', height:'16px'}}/>
                        </button>
                    </div>
                )}

                {/* Download button - always visible */}
                <button 
                    className="btn-download"
                    onClick={downloadBPMN}
                >
                    <span>
                        <img src={downloadIcon} alt="DownloadBPMN" style={{width:'18px',height:'18px'}}></img>
                        Download BPMN
                    </span>
                </button>
            </div>
        </div>
        <div 
            ref={containerRef} 
            className="bpmn-process-container"
            style={{ 
                height: "600px", 
                width: "100%",
                border: "1px solid #ccc",
                backgroundColor: "#fafafa",
                opacity: isLockedByAnotherUser() ? 0.7 : 1
            }}
        />
    </div>
);
}