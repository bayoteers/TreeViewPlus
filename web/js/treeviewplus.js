/**
 * TreeViewPlus namespace
 */
var TVP = {};


/**
 * Default BugTree options values
 *
 * @param {string} type Type of the tree.
 *      "blocked" or "dependson"
 * @param {Array.<string>} titleFields Fields shown in tree node title.
 * @param {boolean} autoSave Should the changes be saved automatically.
 */
TVP.treeOptions = {
    type: "dependson",
    titleFields: ["id", "summary"],
    autoSave: true,
};

TVP.validateOptions = function(options)
{
    if (["dependson", "blocked"].indexOf(options.type) == -1) {
        throw("Unknow tree type '" + options.type + "'");
    }
};

/**
 * Bug tree UI class.
 *
 * This class is resposible for rendering the dynatree and additional controls,
 * plus handling the user interactions.
 */
TVP.TreeUI = Base.extend({
    /**
     * Constructor
     * @param element DOM element, or selector, where tree is rendered.
     * @param {Array.<number>} bugIDs The IDs of root bugs shown in the tree.
     * @param {Object} options Tree options. See TVP.treeOptions
     */
    constructor: function(element, bugIDs, options)
    {
        this.options = $.extend({}, TVP.treeOptions, options);
        TVP.validateOptions(this.options);
        this.elements = {};
        this.elements.tree = $(element).first();
        if (this.elements.tree.size() == 0) {
            throw("Tree container element '" + element + "' not found");
        }

        // Initialize dynatree
        this.elements.tree.dynatree({
            onCreate: this._onCreate.bind(this),
            onActivate: this._onActivate.bind(this),
            onDeactivate: this._onDeactivate.bind(this),
            onKeypress: this._onKeyPress.bind(this),
            onClick: this._onClick.bind(this),
            onDblClick: this._onDblClick.bind(this),
            dnd: {
                preventVoidMoves: true,
                onDragStart: this._onDragStart.bind(this),
                onDragStop: this._onDragStop.bind(this),
                onDrop: this._onDrop.bind(this),
                // Needed for the dragging visual guides
                onDragEnter:function(){return true;},
                onDragOver: function(node, sourceNode, hitMode) {
                    // Just to show that dropping node under it self is a no-no
                    if (node.isDescendantOf(sourceNode)) return false;
                },
            },
        });
        this._dtree = this.elements.tree.dynatree("getTree");

        // Add other elements
        this.elements.messageList = $("ul#tree-messages");

        this.controller = new TVP.TreeController(this, bugIDs);
        this.controller.load();
    },

    /**
     * Called after node has been created in dynatree
     */
    _onCreate: function(node, nodeSpan) {
        this._addNodeButtons(node, nodeSpan);
    },

    /**
     * Handel node activation
     */
    _onActivate: function(node)
    {
        $("span.buttons", node.li).first().show();
        this.highlight(node.data.bugID, true);
    },

    /**
     * Handel node de-activation
     */
    _onDeactivate: function(node)
    {
        $("span.buttons", node.li).first().hide();
        this.highlight(node.data.bugID, false);
    },

    /**
     * Handle clicks on node elements
     */
    _onClick: function(node, event)
    {
        console.log("_onClick", node.getEventTargetType(event));
    },

    /**
     * Handle douple clicks on node elements
     */
    _onDblClick: function(node, event)
    {
        this.openBugInNewWindow();
    },

    /**
     * Handles key commands on dynatree
     */
    _onKeyPress: function(node, event)
    {
        console.log("_onKeyPress", node, event);
        switch (event.keyCode)
        {
            case 111: // o
                node.activate();
                this.openBugInNewWindow();
                break;
            case 99: // c
                node.activate();
                this.openNewChildBug();
                break;
        }
    },

    /**
     * Called when dragging of node starts.
     */
    _onDragStart: function(node)
    {
        console.log("_onDragStart", node);
        var parentNode = node.getParent();
        if (parentNode == this._dtree.getRoot()) return true;
        this.controller.changeParent("remove", node.data.bugID,
                parentNode.data.bugID);
        return true;
    },

    /**
     * Called when node is dropped somewhere on tree.
     */
    _onDrop: function(target, source, hitMode, ui, draggable)
    {
        console.log("_onDrop", target, source, hitMode);
        if (target.isDescendantOf(source)) return false;
        if (hitMode == "over") {
            // Expand target node
            target.expand(true);
        } else {
            hitMode = "over";
            target = target.getParent();
        }
        source.move(target, hitMode);
        if (target != this._dtree.getRoot()) {
            this.controller.changeParent("add", source.data.bugID,
                    target.data.bugID);
        }
        return true;
    },

    _onDragStop: function(node)
    {
        console.log("_onDragStop", node);
        if (this.options.autoSave) {
            this.controller.executeActions();
        }
    },

    /**
     * Clears the tree
     */
    clear: function()
    {
        // Clear tree
        var root = this._dtree.getRoot();
        root.removeChildren();
    },

    /**
     * Adds node in the tree as child of given node.
     *
     * @param {number} bugID ID of this bug.
     * @param {dtnode} parentNode The parent node. Root if not given
     */
    _addNode: function(bugID, parentNode)
    {
        var bugID = Number(bugID);
        if (!parentNode) {
            parentNode = this._dtree.getRoot();
        }

        // Do not add duplicates under same node
        var siblings = parentNode.getChildren();
        if (!$.isEmptyObject(siblings)) {
            for (var i = 0; i < siblings.length; i++) {
                if (siblings[i] && siblings[i].data.bugID == bugID) return;
            }
        }

        var bug = this.controller.bugs[bugID];
        if (bug != undefined) {
            var newNode = parentNode.addChild({
                title: this._getTitle(bug),
                expand: true,
                bugID: bugID,
            });

            // TODO proper prevention of infinite loop on circular dependencies
            if (newNode.getLevel() > 999) {
                this.message("error",
                        "Possible dependency loop around bug " + bugID);
                return;
            }
            var children = bug[this.options.type];
            if (!$.isEmptyObject(children)) {
                for (var i = 0; i < children.length; i++) {
                    this._addNode(children[i], newNode);
                }
            }
        }
        // XXX Should we add lazy nodes for yet unknown bugs?
    },

    /**
     * Adds new bug in the tree.
     * Bug will be added as child to all bugs matching the parentID.
     *
     * @param {number} bugID ID of this bug.
     * @param {number} parentID ID of the parent bug, root if not given.
     */
    addBug: function(bugID, parentID)
    {
        var bugID = Number(bugID);
        var parentID = Number(parentID);
        if (!parentID) {
            this._addNode(bugID);
        } else {
            var that = this;
            this._dtree.visit(function(node) {
                if (node.data.bugID == parentID) {
                    that._addNode(bugID, node);
                    // There should be only one match per branch so we can skip
                    // the rest.
                    return "skip";
                }
            });
        }
    },

    /**
     * Removes bug from the tree.
     */
    removeBug: function(bugID, parentID)
    {
        var bugID = Number(bugID);
        var parentID = Number(parentID);
        var root = this._dtree.getRoot();

        this._dtree.visit(function(node) {
            if(node.data.bugID == bugID) {
                var parentNode = node.getParent();
                if (!parentID && parentNode == root
                        || parentNode.data.bugID == parentID) {
                    node.remove();
                }
            }
        });
    },

    /**
     * Constructs node title.
     */
    _getTitle: function(bug)
    {
        var values = [];
        for (var i = 0; i < this.options.titleFields.length; i++) {
            values.push(bug[this.options.titleFields[i]]);
        }
        return values.join(" - ");
    },

    /**
     * Adds the additional controll buttons to tree node.
     */
    _addNodeButtons: function(node, nodeSpan)
    {
        var bug = this.controller.bugs[node.data.bugID];
        var span = $("<span class='buttons'/>");
        span.hide();
        $(nodeSpan).after(span);
        var link = $("<a href='#' title='Open in new window'>[O]</a>");
        link.click(this.openBugInNewWindow.bind(this));
        span.append(link);
        link = $("<a href='#' title='Create child'>[C]</a>");
        link.click(this.openNewChildBug.bind(this));
        span.append(link);
    },

    openBugInNewWindow: function()
    {
        var node = this._dtree.getActiveNode();
        window.open("show_bug.cgi?id=" + node.data.bugID, "_blank");
    },

    openNewChildBug: function()
    {
        var node = this._dtree.getActiveNode();
        var bug = this.controller.bugs[node.data.bugID];
        // TODO
    },

    /**
     * Turn highlight on/off for nodes based on bug id
     */
    highlight: function(bugID, on)
    {
        this._dtree.visit(function(node)
                {
                    if (node.data.bugID == bugID) {
                        var title = $("a.dynatree-title", node.li).first();
                        if (on) {
                            title.addClass("hl-duple");
                        } else {
                            title.removeClass("hl-duple");
                        }
                    }
                }, false);
    },

    /**
     * Displays message in the message box.
     *
     * @param {string} type Used as a class for the message element.
     * @param {string} message The message to display.
     *
     */
    message: function(type, message)
    {
        if (this.elements.messageList.size == 0) return;
        var mElement = $("<li/>");
        mElement.addClass(type);
        mElement.html(message);
        mElement.click(function() {
            $(this).remove();
        });
        this.elements.messageList.prepend(mElement);
        if (type != "error") {
            mElement.delay(5000).fadeOut("slow", function() {
                $(this).remove();
            });
        }
    }
});


/**
 * Bug tree controller class.
 *
 * This class is resposible for fetching the tree data from BZ and handling the
 * updates.
 *
 */
TVP.TreeController = Base.extend({
    constructor: function(ui, bugIDs)
    {
        this.ui = ui;
        this.bugs = {};
        this.roots = $.map(bugIDs, Number);
        this._actions = new TVP.Action();
    },
    /**
     * Populates the tree with Tree.get_tree() RPC method.
     *
     * @param {Array.<number>} bugIDs - List of bug IDs to fetch
     */
    load: function()
    {
        var rpc = new Rpc("Tree", "get_tree",
                { ids: this.roots, direction: this.ui.options.type });
        rpc.done(this._getTreeDone.bind(this));
        rpc.fail(this._getTreeFail.bind(this));
    },

    /**
     * Displays error message in case fetching the bug tree failed.
     *
     * @param {Object} error JSON RPC error object
     */
    _getTreeFail: function(error)
    {
        this.ui.message("error", error.message);
    },

    /**
     * Processes the data from RPC call and populates the tree.
     *
     * @param {Object} result JSON RPC result object from Tree.get_tree()
     */
    _getTreeDone: function(result)
    {
        // Make sure we use number bug IDs
        this.bugs = {};
        for (var bugID in result.bugs) {
            var bug = result.bugs[bugID];
            bug.id = Number(bug.id);
            bug.dependson = $.map(bug.dependson, Number);
            bug.blocked = $.map(bug.blocked, Number);
            this.bugs[bug.id] = bug;
        }
        this.reset();
    },

    /**
     * Clears and rebuilds the UI.
     */
    reset: function()
    {
        this.ui.clear();
        for (var i=0; i < this.roots.length; i++) {
            this.ui.addBug(this.roots[i]);
        }

    },

    /**
     * Change the parent of a bug.
     *
     * @param {string} change Either "add" or "remove"
     * @param {number} fromID ID of the bug whose parents are being changed
     * @param {number} parentID Parent bug ID to be added or removed
     */
    changeParent: function(change, fromID, parentID)
    {
        var type = this.ui.options.type == "dependson" ? "blocked" : "dependson";
        var params = {};
        params[type] = {};
        params[type][parentID] = change;
        // Get existing action and update params or create new
        var action = new TVP.ChangeDependencies(this.bugs[fromID], params);
        action.onSuccess(this._changeDepSuccess.bind(this));
        action.onFailure(this._actionFail.bind(this));
        action = this._actions.addAction(action);
    },

    _changeDepSuccess: function(action)
    {
        // Update changes to parent bugs
        for (var type in action.params) {
            var rType = type == "dependson" ? "blocked" : "dependson";
            for (var parentID in action.params[type]) {
                var bug = this.bugs[parentID];
                if(!bug) continue;
                var index = bug[rType].indexOf(action.bug.id);
                switch (action.params[type][parentID])
                {
                    case "add":
                        if (index == -1) bug[rType].push(action.bug.id);
                        this.ui.addBug(action.bug.id, parentID);
                        break;
                    case "remove":
                        if (index != -1) bug[rType].splice(index, 1);
                        this.ui.removeBug(action.bug.id, parentID);
                        break;
                }
            }
        }
        this.bugs[action.bug.id] = action.bug;
        this.ui.message("info", action.message);
    },

    _actionFail: function(action)
    {
        this.ui.message("error", action.message);
        this.reset();
    },

    executeActions: function()
    {
        this._actions.lastAction().onDone(this._actionsDone.bind(this));
        this._actions.execute();
    },

    _actionsDone: function()
    {
        this._actions.removeChain();
    },
});


/**
 * Base class for bug modification actions.
 *
 * Action classes are used as helper for deferred and asynchronous modifications
 * to bugs.
 *
 * Actions can be chained with the addAction() method so that they get executed
 * sequentialy when execute() is called for the first action.
 *
 * Actions can support combining. When action is added to a chain where there
 * is already a similar action, the two actions get combined and only executed
 * once.
 *
 * This base action does nothing and can be used as an entry point to action
 * chain. onSuccess and onFailure callbacks for base action are never fired.
 */
TVP.Action = Base.extend({
    // action type
    type: "Action",

    /**
     * Constructor
     *
     * @param {object} bug The bug that this action is related to
     * @param {object} params The action params. See specific Action subclasses
     */
    constructor: function(bug, params)
    {
        this.base();
        this.bug = $.extend({}, bug);
        this.params = params || {};
        this.message = null;
        this.next = null;
        this._successCb = jQuery.Callbacks("unique");
        this._failCb = jQuery.Callbacks("unique");
        this._doneCb = jQuery.Callbacks("unique");
        this._successCb.add(this._doneCb.fire);
        this._failCb.add(this._doneCb.fire);
        this._doneCb.add(this._executeNext.bind(this));
    },

    /**
     * Update the action parameters.
     * @param {object} params New parameters to merge into existing
     * @param {Boolean} deep If true, make a deep merge. See jQuery.extend()
     */
    update: function(params, deep)
    {
        var deep = deep == undefined ? false : Boolean(deep);
        $.extend(deep, this.params, params);
    },

    /**
     * Executes the action.
     */
    execute: function()
    {
        this._doneCb.fire(this)
    },

    _executeNext: function()
    {
        if (this.next != null) this.next.execute();
    },

    /**
     * Adds new action to the chain.
     */
    addAction: function(action)
    {
        // See if we can combine these actions
        if (this._combine(action)) return this;
        // If not, add it as next or push forward
        if (this.next == null) {
            this.next = action;
            return action;
        } else {
            return this.next.addAction(action);
        }
    },

    /**
     * Detaches the actions in chain after this one.
     */
    removeChain: function()
    {
        if (this.next == null) return;
        this.next.removeChain();
        this.next = null;
    },

    /**
     * Returns the last action in this action chain.
     */
    lastAction: function()
    {
        if (this.next == null) return this;
        return this.next.lastAction();
    },

    /**
     * Combines two actions.
     *
     * Override in inherited class and return true if combining was successful,
     * otherwise false.
     */
    _combine: function(action)
    {
        return false;
    },

    /**
     * Bind callback to fire on successful execution of the action.
     *
     * The callback gets the action object as first argument
     */
    onSuccess: function(callback)
    {
        this._successCb.add(callback);
    },

    /**
     * Bind callback to fire on failure to execute the action.
     *
     * The callback gets the action object as first argument
     */
    onFailure: function(callback)
    {
        this._failCb.add(callback);
    },

    /**
     * Bind callback to fire after this action has been executed.
     *
     * This is callback is fired first and any onSuccess or on Failure
     * callbacks come after this depending on the result.
     *
     * The callback gets the action object as first argument
     */
    onDone: function(callback)
    {
        this._doneCb.add(callback);
    },

});

/**
 * Action for changing bug dependencies.
 *
 * This action takes parameters in following format
 *
 *      {
 *          dependson: {
 *              <bugID>: <"add" / "remove">
 *          }
 *          blocked: {
 *              <bugID>: <"add" / "remove">
 *          }
 *      }
 *
 *  Where <bugID> is the bug ID to be added or removed from the corresponding
 *  dependency list.
 */
TVP.ChangeDependencies = TVP.Action.extend({

    type: "ChangeDependencies",

    /**
     * See Action._combine()
     */
    _combine: function(action)
    {
        if (this.type != action.type
            || this.bug.id != action.bug.id) return false;
        this.update(action.params, true);
        return true;
    },

    /**
     * See Action.execute()
     */
    execute: function()
    {
        var changed = false;
        for (var key in this.params) {
            for (var bugID in this.params[key]) {
                switch (this.params[key][bugID]) {
                    case "add":
                        changed = this._add(key, bugID) || changed;
                        break;
                    case "remove":
                        changed = this._remove(key, bugID) || changed;
                        break;
                }
            }
        }
        if (!changed) return;
        var rpc = new Rpc("Tree", "set_dependencies", {
                id: this.bug.id,
                dependson: this.bug.dependson,
                blocked: this.bug.blocked
        });
        rpc.done(this._setDepsDone.bind(this));
        rpc.fail(this._setDepsFail.bind(this));
    },

    /**
     * Helper to add dependency
     */
    _add: function(key, bugID)
    {
        var bugID = Number(bugID);
        if (this.bug[key].indexOf(bugID) != -1) return false;
        this.bug[key].push(bugID);
        return true;
    },

    /**
     * Helper to remove dependency
     */
    _remove: function(key, bugID)
    {
        var bugID = Number(bugID);
        var index = this.bug[key].indexOf(bugID);
        if (index == -1) return false;
        this.bug[key].splice(index, 1);
        return true;
    },

    /**
     * set_dependencies() RPC success handler.
     */
    _setDepsDone: function(result)
    {
        console.log(result);
        this.message = "Succesfully changed dependencies of bug "
                + this.bug.id;
        // TODO parse the changes in the message
        this._successCb.fire(this);
    },

    /**
     * set_dependencies() RPC failure handler.
     */
    _setDepsFail: function(error)
    {
        this.message = "Failed to change dependencies of bug " + this.bug.id
            + ": " + error.message;
        this._failCb.fire(this);
    }
});


/**
 * Action for creating new bug.
 *
 * The values are taken from the given bug and params are used to override
 * field values.
 *
 * After execution the params member will contain the new bug data
 *
 */
TVP.CreateNewBug = TVP.Action.extend({
    type: "CreateNewBug",

    execute: function()
    {
        var newBug = $.extend({}, this.bug);
        // Clear some unwanted values
        newBug.dependson = [];
        newBug.blocked = [];
        newBug.id = null;
        this.params = $.extend(newBug, this.params);
        var rpc = new Rpc("Bug", "create", this.params);
        rpc.done(this._createDone.bind(this));
        rpc.fail(this._createFail.bind(this));
    },

    /**
     * Bug.create() RPC success.
     */
    _createDone: function(result)
    {
        this.bug.id = Number(result.id);
        // Bug.create() does not support dependencies, so we set them separately
        if ($.isEmptyObject(this.params.dependson) &&
                $.isEmptyObject(this.params.blocked)) {
            this._allDone();
            return;
        }
        var rpc = new Rpc("Tree", "set_dependencies", {
                id: this.params.id,
                dependson: this.params.dependson,
                blocked: this.params.blocked
        });
        rpc.done(this._allDone.bind(this));
        rpc.fail(this._setDepsFail.bind(this));
    },

    /**
     * Bug.create() RPC failure.
     */
    _createFail: function(error)
    {
        this.message = "Failed to create new bug: " + error.message;
        this._failCb.fire(this);
    },

    /**
     * set_dependencies() RPC success handler.
     */
    _allDone: function(result)
    {
        // update original bug dependson / blocked
        var map = {dependson: "blocked", blocked: "dependson"};
        for (var key in map)
        {
            for (var i = 0; i < this.params[key].length; i++)
            {
                var id = this.params[key][i];
                if ( id == this.bug.id
                        && this.bug[map[key]].indexOf(id) == -1){
                    this.bug[map[key]].push(id);
                }
            }
        }
        this.message = "Successfully created bug" + this.params.id;
        this._successCb.fire(this);
    },

    /**
     * set_dependencies() RPC failure handler.
     */
    _setDepsFail: function(error)
    {
        this.message = "Created bug " + this.params.id + ", but failed to set "
            + "the dependencies: " + error.message;
        this._failCb.fire(this);
    },
});
