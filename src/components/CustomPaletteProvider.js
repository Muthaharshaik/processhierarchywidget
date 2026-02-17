/**
 * Palette Provider that filters out unwanted default tools
 */
class CustomPaletteProvider {
    constructor(palette, create, elementFactory, spaceTool, lassoTool, handTool, globalConnect, translate) {
        this.palette = palette;
        this.create = create;
        this.elementFactory = elementFactory;
        this.spaceTool = spaceTool;
        this.lassoTool = lassoTool;
        this.handTool = handTool;
        this.globalConnect = globalConnect;
        this.translate = translate;

        // Register with HIGH priority to override defaults
        palette.registerProvider(1100, this);
    }

    getPaletteEntries(element) {
        const {
            spaceTool,
            lassoTool,
            handTool,
            globalConnect,
            translate
        } = this;

        // Only return the tools we want
        return {
            'hand-tool': {
                group: 'tools',
                className: 'bpmn-icon-hand-tool',
                title: translate('Activate Hand Tool'),
                action: {
                    click: function(event) {
                        handTool.activateHand(event);
                    }
                }
            },
            'lasso-tool': {
                group: 'tools',
                className: 'bpmn-icon-lasso-tool',
                title: translate('Activate Lasso Tool'),
                action: {
                    click: function(event) {
                        lassoTool.activateSelection(event);
                    }
                }
            },
            'space-tool': {
                group: 'tools',
                className: 'bpmn-icon-space-tool',
                title: translate('Activate Space Tool'),
                action: {
                    click: function(event) {
                        spaceTool.activateSelection(event);
                    }
                }
            },
            'global-connect-tool': {
                group: 'tools',
                className: 'bpmn-icon-connection-multi',
                title: translate('Activate Global Connect Tool'),
                action: {
                    click: function(event) {
                        globalConnect.start(event);
                    }
                }
            },
            'tool-separator': {
                group: 'tools',
                separator: true
            }
        };
    }
}

CustomPaletteProvider.$inject = [
    'palette',
    'create',
    'elementFactory',
    'spaceTool',
    'lassoTool',
    'handTool',
    'globalConnect',
    'translate'
];

export default {
    __init__: ['customPaletteProvider'],
    customPaletteProvider: ['type', CustomPaletteProvider]
};