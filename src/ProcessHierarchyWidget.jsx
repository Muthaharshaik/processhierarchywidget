import { createElement, useEffect, useRef, useCallback } from "react";
import BpmnModeler from "bpmn-js/lib/Modeler";
import { is } from "bpmn-js/lib/util/ModelUtil";
import "./ui/ProcessHierarchyWidget.css";
import downloadIcon from "./assets/download-svgrepo-com.svg"
import saveIcon from "./assets/save-svgrepo-com.svg"

export function ProcessHierarchyWidget(props) {
    const {
        processXML,
        libraryName,
        onProcessClick,
        onSaveXML,
        readOnly
    } = props;

    const containerRef = useRef(null);
    const modelerRef = useRef(null);
    const lastImportedXmlRef = useRef(null);

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
        <dc:Bounds x="200" y="100" width="260" height="60"/>
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
    };

    /**
     * Initialize the BPMN Modeler with custom modules
     */
    useEffect(() => {
        if (!containerRef.current) return;

        // Destroy existing modeler if any
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

        // Import initial XML
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

                // Set up event listeners
                const eventBus = modeler.get("eventBus");
                
                // Listen for element clicks (process selection)
                eventBus.on("element.click", (event) => {
                    const { element } = event;
                    if (is(element, "bpmn:SubProcess") && 
                        element.businessObject.get("process:processId")) {
                        if (onProcessClick && onProcessClick.canExecute) {
                            onProcessClick.execute();
                        }
                    }
                });

                // Listen for changes to auto-save
                if (onSaveXML && onSaveXML.canExecute && !readOnly) {
                    eventBus.on("commandStack.changed", () => {
                        exportAndSaveXML();
                    });
                }
            })
            .catch(err => {
                console.error("Error importing BPMN diagram:", err);
            });

        // Cleanup on unmount
        return () => {
            if (modelerRef.current) {
                modelerRef.current.destroy();
            }
        };
    }, []); // Run once on mount

    /**
     * Update root process name when libraryName changes
     */
    useEffect(() => {
        if (!modelerRef.current) return;
        if (!libraryName?.value) return;
        if (processXML?.value) return; // Don't override if XML already exists

        // Update the root process name
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

    /**
     * Handle XML updates from Mendix
     */
    useEffect(() => {
        if (!modelerRef.current) return;
        if (!processXML?.value) return;

        // Skip if XML hasn't changed
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

    /**
     * Validate diagram before saving
     */
    const validateDiagram = useCallback(() => {
        if (!modelerRef.current) return { valid: true, errors: [] };

        const elementRegistry = modelerRef.current.get('elementRegistry');
        const errors = [];
        
        // Get all elements
        const allElements = elementRegistry.getAll();
        
        // Check each process for multiple parents
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

    /**
     * Export current diagram as XML and save to Mendix
     */
    const exportAndSaveXML = useCallback(() => {
        if (!modelerRef.current || !onSaveXML || !onSaveXML.canExecute) return;

        // Validate before saving
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
    }, [processXML, onSaveXML, validateDiagram]);

    /**
     * Show validation errors
     */
    const showValidationError = useCallback((errors) => {
        if (!containerRef.current) return;
        
        // Remove existing error messages
        const existingErrors = containerRef.current.querySelectorAll('.validation-error-overlay');
        existingErrors.forEach(error => error.remove());
        
        // Create error overlay
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
        
        // Clear timer if manually closed
        closeButton.onclick = () => {
            clearTimeout(timeout);
            overlay.remove();
        };
    }, []);

    /**
     * Download current diagram as BPMN file
     */
    const downloadBPMN = useCallback(() => {
        if (!modelerRef.current) return;

        modelerRef.current
            .saveXML({ format: true })
            .then(({ xml }) => {
                // Create a blob from the XML
                const blob = new Blob([xml], { type: 'application/bpmn+xml' });
                
                // Create download link
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                
                // Use library name for filename, or default
                const fileName = libraryName?.value 
                    ? `${libraryName.value.replace(/\s+/g, '_')}_Process_Hierarchy.bpmn`
                    : 'Process_Hierarchy.bpmn';
                
                link.download = fileName;
                document.body.appendChild(link);
                link.click();
                
                // Cleanup
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            })
            .catch(err => {
                console.error("Error downloading BPMN:", err);
            });
    }, [libraryName]);

    return (
        <div className="process-hierarchy-widget">
            <div className="process-hierarchy-header">
                <h3>{libraryName?.value || "Process Hierarchy"}</h3>
                {!readOnly && (
                    <div className="header-buttons">
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
                            className="btn-download"
                            onClick={downloadBPMN}
                        >
                            <span>
                                <img src={downloadIcon} alt="DownloadBPMN" style={{width:'18px',height:'18px'}}></img>
                                Download BPMN
                            </span>
                        </button>
                    </div>
                )}
            </div>
            <div 
                ref={containerRef} 
                className="bpmn-process-container"
                style={{ 
                    height: "600px", 
                    width: "100%",
                    border: "1px solid #ccc",
                    backgroundColor: "#fafafa"
                }}
            />
        </div>
    );
}