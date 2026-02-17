class CustomProcessContextPad {
    constructor(contextPad, modeling, connect) {
        this.modeling = modeling;
        this.connect = connect;
        
        contextPad.registerProvider(1100, this);
    }

    getContextPadEntries(element) {
        const { modeling, connect } = this;

        if (element.type !== 'bpmn:SubProcess') {
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
            }
        };
    }
}

CustomProcessContextPad.$inject = ['contextPad', 'modeling', 'connect'];

export default {
    __init__: ['customProcessContextPad'],
    customProcessContextPad: ['type', CustomProcessContextPad]
};