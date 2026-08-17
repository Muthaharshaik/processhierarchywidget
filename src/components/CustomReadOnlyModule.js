import RuleProvider from "diagram-js/lib/features/rules/RuleProvider";

/**
 * Read-only support — added to the modeler only when the widget is read-only.
 *
 * Editing is vetoed at the rules layer, so a drag never even starts: the node
 * stays put instead of being moved around a diagram the user cannot save.
 * Navigation is left alone — panning, zooming, collapsing and opening a
 * process all keep working.
 */

// Above every other rule provider, including CustomProcessRules.
const VETO_PRIORITY = 5000;

// Every rule diagram-js / bpmn-js consults before mutating the diagram.
const EDIT_RULES = [
    "elements.move",
    "elements.create",
    "elements.delete",
    "elements.align",
    "elements.distribute",
    "element.copy",
    "element.autoResize",
    "shape.create",
    "shape.attach",
    "shape.replace",
    "shape.resize",
    "shape.toggleCollapse",
    "connection.create",
    "connection.start",
    "connection.reconnect",
    "connection.updateWaypoints"
];

class ReadOnlyRules extends RuleProvider {
    constructor(eventBus) {
        super(eventBus);
    }

    init() {
        this.addRule(EDIT_RULES, VETO_PRIORITY, () => false);
    }
}

ReadOnlyRules.$inject = ["eventBus"];

/**
 * Replaces diagram-js' move feature. Without it, a mousedown on a shape is
 * left for MoveCanvas to pick up, so the whole diagram can be dragged from
 * anywhere — not only from empty canvas.
 */
class NoopMove {
    start() {}
}

/**
 * Replaces bpmn-js' label editing provider. Nothing registers itself with
 * directEditing, so a double-click can no longer open the rename box (the
 * widget uses that double-click to navigate to the process instead).
 */
class NoopLabelEditingProvider {}

export default {
    __init__: ["readOnlyRules"],
    readOnlyRules: ["type", ReadOnlyRules],
    move: ["type", NoopMove],
    labelEditingProvider: ["type", NoopLabelEditingProvider]
};
