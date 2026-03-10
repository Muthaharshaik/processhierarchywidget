import { is } from 'bpmn-js/lib/util/ModelUtil';

class CustomProcessContextPad {
    constructor(contextPad, modeling, connect, eventBus, commandStack) {
        this.modeling = modeling;
        this.connect = connect;
        this.eventBus = eventBus;
        this.commandStack = commandStack;

        contextPad.registerProvider(1100, this);
    }

    getContextPadEntries(element) {
        const { modeling, connect, eventBus, commandStack } = this;

        if (!is(element, 'bpmn:SubProcess') ||
            !element.businessObject.get('process:processId')) {
            return {};
        }

        const widgetContainer = document.querySelector('.process-hierarchy-widget');
        const isLocked = widgetContainer?.getAttribute('data-locked') === 'true';

        if (isLocked) {
            return {};
        }

        return {
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
    'commandStack'
];

export default {
    __init__: ['customProcessContextPad'],
    customProcessContextPad: ['type', CustomProcessContextPad]
};