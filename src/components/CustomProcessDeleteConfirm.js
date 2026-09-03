import { is } from "bpmn-js/lib/util/ModelUtil";

/**
 * Confirmation gate for deleting process nodes.
 *
 * Removing a process that already lives in the library also takes its
 * processmap with it, so that delete has to be confirmed. A process drawn in
 * this editing session exists only in the undo stack — nothing is attached to
 * it yet — so it is removed straight away.
 *
 * Every delete gesture (our context pad entry, the bpmn-js one, the Delete
 * key, cut) ends up in modeling.removeElements, so that single method is
 * wrapped rather than each of the entry points. When confirmation is needed
 * the call is parked and `process.confirm-delete` is fired for the React
 * widget to show the dialog; confirm() replays the parked call, cancel()
 * drops it. Nothing reaches the command stack until then, so cancelling
 * leaves undo/redo exactly as it was.
 */
class CustomProcessDeleteConfirm {
    constructor(eventBus, modeling, elementRegistry) {
        this._eventBus        = eventBus;
        this._modeling        = modeling;
        this._elementRegistry = elementRegistry;

        // process:processId values known to exist in the library. Refreshed by
        // the widget after every load from Mendix and after every save.
        this._savedProcessIds = new Set();

        // Elements waiting on the user's answer, or null.
        this._pending = null;

        const removeElements = modeling.removeElements.bind(modeling);
        this._removeElements = removeElements;

        modeling.removeElements = (elements) => {
            const saved = this._savedProcesses(elements);

            if (!saved.length) {
                removeElements(elements);
                return;
            }

            // A dialog is already up for an earlier gesture — let the user answer
            // that one instead of silently replacing it.
            if (this._pending) return;

            this._pending = elements.slice();

            eventBus.fire("process.confirm-delete", {
                processNames: saved.map(el =>
                    el.businessObject.get("process:processName") ||
                    el.businessObject.name ||
                    "this process"
                )
            });
        };

        eventBus.on("diagram.destroy", () => {
            delete modeling.removeElements;   // back to the prototype method
            this._pending = null;
        });
    }

    /**
     * Marks every process currently on the canvas as stored in the library.
     * Called after a load from Mendix and after a successful save — from then
     * on, deleting one of them asks first.
     */
    markCanvasAsSaved() {
        const saved = new Set();
        this._elementRegistry.getAll().forEach(element => {
            const processId = this._processId(element);
            if (processId) saved.add(processId);
        });
        this._savedProcessIds = saved;
    }

    hasPending() {
        return this._pending !== null;
    }

    /** User pressed Delete in the dialog. */
    confirm() {
        const pending = this._pending;
        this._pending = null;
        if (!pending) return;

        // A pending delete survives the dialog being open, during which the
        // canvas may have changed (undo, a fresh import) — only remove what is
        // still there.
        const elements = pending.filter(el => this._elementRegistry.get(el.id));
        if (elements.length) this._removeElements(elements);
    }

    /** User dismissed the dialog. */
    cancel() {
        this._pending = null;
    }

    _processId(element) {
        if (!is(element, "bpmn:SubProcess")) return null;
        return element.businessObject?.get?.("process:processId") || null;
    }

    _savedProcesses(elements) {
        return (elements || []).filter(element => {
            const processId = this._processId(element);
            return processId && this._savedProcessIds.has(processId);
        });
    }
}

CustomProcessDeleteConfirm.$inject = ["eventBus", "modeling", "elementRegistry"];

export default {
    __init__: ["customProcessDeleteConfirm"],
    customProcessDeleteConfirm: ["type", CustomProcessDeleteConfirm]
};
