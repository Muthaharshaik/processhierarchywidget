import BaseRenderer from "diagram-js/lib/draw/BaseRenderer";
import { attr as svgAttr } from "tiny-svg";
import { is } from "bpmn-js/lib/util/ModelUtil";

const HIGH_PRIORITY = 1500;

class CustomProcessRenderer extends BaseRenderer {
    constructor(eventBus, bpmnRenderer) {
        super(eventBus, HIGH_PRIORITY);
        this.bpmnRenderer = bpmnRenderer;
    }

    canRender(element) {
        return (
            is(element, "bpmn:SubProcess") &&
            element.businessObject.get &&
            element.businessObject.get("process:processType")
        );
    }

    drawShape(parentNode, element) {
        const shape = this.bpmnRenderer.drawShape(parentNode, element);

        if (
            is(element, "bpmn:SubProcess") &&
            element.businessObject.get("process:processType")
        ) {
            const processType = element.businessObject.get("process:processType");

            const color =
                processType === "valuechain" ? "#6B46C1" : "#2563EB";

            svgAttr(shape, {
                stroke: color,
                strokeWidth: 2,
                fill: `${color}15`
            });
        }

        return shape;
    }
}

CustomProcessRenderer.$inject = ["eventBus", "bpmnRenderer"];

export default {
    __init__: ["customProcessRenderer"],
    customProcessRenderer: ["type", CustomProcessRenderer]
};
