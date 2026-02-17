import BaseRenderer from "diagram-js/lib/draw/BaseRenderer";
import {
    append as svgAppend,
    attr as svgAttr,
    create as svgCreate
} from "tiny-svg";
import { is } from "bpmn-js/lib/util/ModelUtil";

const HIGH_PRIORITY = 1500;

/**
 * Custom Renderer for Process elements
 * Renders processes with icons and custom styling
 */
class CustomProcessRenderer extends BaseRenderer {
    constructor(eventBus, bpmnRenderer) {
        super(eventBus, HIGH_PRIORITY);
        this.bpmnRenderer = bpmnRenderer;
    }

    canRender(element) {
        return is(element, "bpmn:SubProcess") && 
            element.businessObject.get &&
            element.businessObject.get("process:processType");
    }

    drawShape(parentNode, element) {
        const shape = this.bpmnRenderer.drawShape(parentNode, element);
        
        if (is(element, 'bpmn:SubProcess') && element.businessObject.get('process:processType')) {
            const processType = element.businessObject.get('process:processType');
            
            // Remove subprocess markers
            setTimeout(() => {
                this.removeSubProcessMarkers(parentNode);
            }, 10);
            
            element.collapsed = undefined;
            
            // Add icon based on type
            const icon = svgCreate("text");
            svgAttr(icon, {
                x: 15,
                y: 35,
                fontSize: "24px"
            });
            icon.textContent = processType === 'valuechain' ? "🔗" : "🔄";
            svgAppend(parentNode, icon);
            
            // Different colors
            const color = processType === 'valuechain' ? '#6B46C1' : '#2563EB';
            svgAttr(shape, {
                stroke: color,
                strokeWidth: 2,
                fill: `${color}15`
            });
        }

        return shape;
    }

    removeSubProcessMarkers(parentNode) {
        // Find and remove all marker elements
        const markers = parentNode.querySelectorAll('[data-marker]');
        markers.forEach(m => m.remove());
        
        // Find the visual group
        const visualGroup = parentNode.querySelector('.djs-visual');
        if (visualGroup) {
            // Remove any rect that's 14x14 (that's the plus icon background)
            const rects = visualGroup.querySelectorAll('rect[width="14"][height="14"]');
            rects.forEach(r => r.remove());
            
            // Remove any path with the plus icon pattern
            const paths = visualGroup.querySelectorAll('path');
            paths.forEach(path => {
                const d = path.getAttribute('d');
                if (d && (d.includes('M122') || d.includes('M 122'))) {
                    path.remove();
                }
            });
        }
    }

    getShapePath(shape) {
        if (is(shape, 'bpmn:SubProcess') && shape.businessObject.get('process:processName')) {
            // Return sharp rectangle path (relative coordinates)
            const width = shape.width;
            const height = shape.height;
            
            return [
                ['M', 0, 0],           // Move to top-left
                ['l', width, 0],       // Line to top-right
                ['l', 0, height],      // Line to bottom-right
                ['l', -width, 0],      // Line to bottom-left
                ['z']                  // Close path back to start
            ];
        }
        
        return this.bpmnRenderer.getShapePath(shape);
    }
}

CustomProcessRenderer.$inject = ["eventBus", "bpmnRenderer"];

// Export as module
export default {
    __init__: ["customProcessRenderer"],
    customProcessRenderer: ["type", CustomProcessRenderer]
};