import { is } from 'bpmn-js/lib/util/ModelUtil';
import { createProcessShape } from './createProcessShape';

class CustomProcessContextPad {
    constructor(contextPad, modeling, connect, eventBus, commandStack,
                bpmnFactory, elementFactory, elementRegistry, autoPlace, create) {
        this.modeling        = modeling;
        this.connect         = connect;
        this.eventBus        = eventBus;
        this.commandStack    = commandStack;
        this.bpmnFactory     = bpmnFactory;
        this.elementFactory  = elementFactory;
        this.elementRegistry = elementRegistry;
        this.autoPlace       = autoPlace;
        this.create          = create;

        contextPad.registerProvider(1100, this);
    }

    getContextPadEntries(element) {
        const { modeling, connect, eventBus, commandStack,
                bpmnFactory, elementFactory, elementRegistry, autoPlace, create } = this;

        if (!is(element, 'bpmn:SubProcess') ||
            !element.businessObject.get('process:processId')) {
            return {};
        }

        const widgetContainer = document.querySelector('.process-hierarchy-widget');
        const isLocked   = widgetContainer?.getAttribute('data-locked')   === 'true';
        const isReadOnly = widgetContainer?.getAttribute('data-readonly') === 'true';

        if (isLocked || isReadOnly) {
            return {};
        }

        // A collapsed parent hides its whole subtree, and that state lives in the
        // React widget — ask it to expand so the new child does not land in a
        // hidden row.
        function ensureExpanded(element) {
            eventBus.fire('process.ensure-expanded', { elementId: element.id });
        }

        function newProcess(processType) {
            return createProcessShape(bpmnFactory, elementFactory, elementRegistry, processType);
        }

        // Child process straight off the node: click drops it in place, dragging
        // lets you pick the spot. Either way the parent link is created for you —
        // no palette drag plus manual connect. bpmn-js opens the rename box once
        // the shape lands, so the placeholder name never has to stick.
        function appendEntry(processType, className, title) {
            return {
                group: 'model',
                className: className,
                title: title,
                action: {
                    click: function(event, element) {
                        ensureExpanded(element);
                        autoPlace.append(element, newProcess(processType));
                    },
                    dragstart: function(event, element) {
                        ensureExpanded(element);
                        create.start(event, newProcess(processType), { source: element });
                    }
                }
            };
        }

        return {
            'append-process': appendEntry(
                'process',
                'custom-append-process-icon',
                'Add process'
            ),

            'append-valuechain': appendEntry(
                'valuechain',
                'custom-append-valuechain-icon',
                'Add value chain'
            ),

            'connect': {
                group: 'connect',
                className: 'bpmn-icon-connection-multi',
                title: 'Connect',
                action: {
                    click: function(event, element) {
                        connect.start(event, element);
                    }
                }
            },

            // CustomProcessDeleteConfirm wraps removeElements, so a node that is
            // already in the saved library puts up a confirmation dialog from
            // here without this entry having to know about it.
            'delete': {
                group: 'edit',
                className: 'bpmn-icon-trash',
                title: 'Remove',
                action: {
                    click: function(event, element) {
                        modeling.removeElements([element]);
                    }
                }
            },

            'open-process': {
                group: 'edit',
                className: 'custom-open-process-icon',
                title: 'Go to Process',
                action: {
                    click: function(event, element) {

                        const isDirty = commandStack.canUndo();

                        if (isDirty) {
                            eventBus.fire('process.unsaved-warning');
                            return;
                        }

                        const processId = element.businessObject.get('process:processId');

                        if (processId) {
                            eventBus.fire('process.open', {
                                processId: processId
                            });
                        }
                    }
                }
            }
        };
    }
}

CustomProcessContextPad.$inject = [
    'contextPad',
    'modeling',
    'connect',
    'eventBus',
    'commandStack',
    'bpmnFactory',
    'elementFactory',
    'elementRegistry',
    'autoPlace',
    'create'
];

export default {
    __init__: ['customProcessContextPad'],
    customProcessContextPad: ['type', CustomProcessContextPad]
};
