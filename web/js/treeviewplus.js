/**
 * TreeViewPlus namespace
 */
var TVP = {};


/**
 * Default BugTree options values
 *
 * @param {boolean} autoSave Should the changes be saved automatically.
 * @param {string} messageList jQuery selector for message list element.
 * @param {Array.<string>} titleFields Fields shown in tree node title.
 * @param {string} type Type of the tree.
 *      "blocked" or "dependson"
 */
TVP.treeOptions = {
    autoSave: true,
    messageList: null,
    titleFields: ["id", "status", "assigned_to", "summary"],
    type: "dependson",
};

/**
 * Validates and normalizes options.
 */
TVP.validateOptions = function(options)
{
    if (["dependson", "blocked"].indexOf(options.type) == -1) {
        throw("Unknow tree type '" + options.type + "'");
    }
    options.autoSave = Boolean(options.autoSave);
};

// Non visible fields required when creating new bugs
TVP._requiredFields = {
    product: "product",
    component: "component",
    version: "version",
    op_sys: "op_sys",
    platform: "rep_platform",
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
        this.controller = new TVP.TreeController(this, bugIDs);
        this.elements = {};
        this.elements.tree = $(element).first();
        if (this.elements.tree.size() == 0) {
            throw("Tree container element '" + element + "' not found");
        }

        // Initialize dynatree
        this.elements.tree.dynatree({
            keyboard: false,
            onCreate: this._onCreate.bind(this),
            onActivate: this._onActivate.bind(this),
            onDeactivate: this._onDeactivate.bind(this),
            onClick: this._onClick.bind(this),
            onDblClick: this._onDblClick.bind(this),

            onCustomRender: this._renderNodeTitle.bind(this),

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
        this._addUiElements();

        // Load the tree
        this.controller.load();
    },

    _addUiElements: function()
    {
        if (this.options.messageList) {
            this.elements.messageList = $(this.options.messageList).first();
            this.elements.addClass("tvp-messages");
        } else {
            this.elements.messageList = $("<ul class='tvp-messages'/>");
            this.elements.tree.append(this.elements.messageList);
        }
        var controls = $("<span class='tvp-controls'/>");
        // Direction toggle button
        this.elements.toggleType = $("<input type='button'/>");
        this.elements.toggleType.attr("value", this.options.type);
        this.elements.toggleType.click(this.toggleType.bind(this));
        controls.append(this.elements.toggleType);
        //Save thingies.
        this.elements.save = $("<input type='button' value='Save'/>");
        this.elements.save.click(
                this.controller.executeActions.bind(this.controller));
        controls.append(this.elements.save);
        this.elements.autoSave = $("<input type='checkbox'/>");
        this.elements.autoSave.change(this.toggleAutoSave.bind(this));
        controls.append(this.elements.autoSave);
        controls.append("Auto save");
        if (this.options.autoSave) {
            this.elements.save.attr("disabled", "disabled");
            this.elements.autoSave.attr("checked", "checked");
        }

        this.elements.tree.prepend(controls);
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
        console.log("_onActivate", node);
        $(".tvp-buttons", node.li).first().show();
        this.highlight(node.data.bugID, true);
        // this is here because closing the enterBug breaks deactivate
        this.closeEnterBug();
    },

    /**
     * Handel node de-activation
     */
    _onDeactivate: function(node)
    {
        console.log("_onDeactivate", node);
        $(".tvp-buttons", node.li).first().hide();
        this.highlight(node.data.bugID, false);
    },

    /**
     * Handle clicks on node elements
     */
    _onClick: function(node, event)
    {
        console.log("_onClick", node.getEventTargetType(event));
        // Prevent dynatree stealing focus if edit form is open
        if (this.elements.enterBug && node.isActive()) return false;
    },

    /**
     * Handle douple clicks on node elements
     */
    _onDblClick: function(node, event)
    {
        this.openBugInNewWindow();
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
            var nodeParams = { bugID: bugID, expand: true };
            if (! bug.is_open) nodeParams.addClass = "tvp-closed-bug";
            var newNode = parentNode.addChild(nodeParams);

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
    _renderNodeTitle: function(node)
    {
        var bug = this.controller.bugs[node.data.bugID];
        var values = [];
        for (var i = 0; i < this.options.titleFields.length; i++) {
            values.push(bug[this.options.titleFields[i]]);
        }
        return "<a href='#' class='dynatree-title'>" +
                    values.join(" - ") + "</a>";
    },

    /**
     * Adds the additional controll buttons to tree node.
     */
    _addNodeButtons: function(node, nodeSpan)
    {
        var bug = this.controller.bugs[node.data.bugID];
        var span = $("<span class='tvp-buttons'/>");
        span.hide();
        $(nodeSpan).after(span);
        var link = $("<a href='#' title='Open in new window'>[O]</a>");
        link.click(this.openBugInNewWindow.bind(this));
        span.append(link);
        link = $("<a href='#' title='Create new dependency'>[+]</a>");
        link.click(this.openEnterBug.bind(this));
        span.append(link);
    },

    openBugInNewWindow: function()
    {
        var node = this._dtree.getActiveNode();
        var newWindow = window.open("show_bug.cgi?id=" + node.data.bugID,
                "bug_" + node.data.bugID);
        $(newWindow).unload(this._bugWindowClosed.bind(this));
    },

    _bugWindowClosed: function(eventData)
    {
        // TODO This is just a hack for detecting the bug update in other window
        // This works just by mere luck but it's probably better than nothing...
        // And we are going to add the inline editing in the tree anyways...
        var idRE = /show_bug\.cgi.*id=(\d+)/;
        var match = idRE.exec(eventData.target.URL);
        if (eventData.type == "unload" && match) {
            this.controller.updateBugs([match[1]]);
        }
    },

    openEnterBug: function()
    {
        if (this.elements.enterBug) return;
        var node = this._dtree.getActiveNode();
        // Clone the form
        var form = $("#tvp-templates .tvp-enter-bug").clone();
        this.elements.enterBug = form;
        form.attr("id", "enterbug_" + node.data.bugID);
        form.find("[name='save']").click(this._createBug.bind(this));
        form.find("[name='cancel']").click(this.closeEnterBug.bind(this));
        // Display
        $(".tvp-buttons", node.li).first().after(form);
        form.find("[name='severity']").focus();
    },

    closeEnterBug: function()
    {
        if (!this.elements.enterBug) return;
        this.elements.enterBug.remove();
        this.elements.enterBug = null;
        this._dtree.getActiveNode().focus();
    },

    _createBug: function()
    {
        var node = this._dtree.getActiveNode();
        var params = {};
        this.elements.enterBug.find(".tvp-field").each(function(){
            var field = $(this);
            params[field.attr("name")] = field.val();
        });
        this.controller.createChild(node.data.bugID, params);
        this.closeEnterBug();
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
                            title.addClass("tvp-hl-node");
                        } else {
                            title.removeClass("tvp-hl-node");
                        }
                    }
                }, false);
    },

    toggleType: function()
    {
        this.options.type = this.options.type == "dependson"
            ? "blocked" : "dependson";
        this.elements.toggleType.val(this.options.type);
        this.controller.load();
    },

    toggleAutoSave: function()
    {
        if (this.options.autoSave) {
            if (confirm("Manual saving might not work as well as autosave " +
                        "and unsaved changes are not tracked, so you have " +
                        "to remember to save the changes.\n\n" +
                        "Continue anyway?")){
                this.elements.save.removeAttr("disabled");
            } else {
                this.elements.autoSave.attr("checked", "checked");
                return;
            }
        } else {
            this.elements.save.attr("disabled", "disabled");
            this.elements.autoSave.attr("checked", "checked");
        }
        this.options.autoSave = !this.options.autoSave;
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
 * Helper for cleaning the bug data returned from RPC
 */
TVP._cleanBugs = function(bugs) {
    for (var bugID in bugs) {
        var bug = bugs[bugID];
        bug.id = Number(bug.id);
        bug.dependson = $.map(bug.dependson, Number);
        bug.blocked = $.map(bug.blocked, Number);
        bugs[bug.id] = bug;
    }
}

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
        TVP._cleanBugs(result.bugs);
        this.bugs = result.bugs;
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

    createChild: function(parentID, params)
    {
        var type = this.ui.options.type == "dependson" ? "blocked" : "dependson";
        params[type] = [parentID];
        var action = new TVP.CreateNewBug(this.bugs[parentID], params);
        action.onSuccess(this._createSuccess.bind(this));
        action.onFailure(this._actionFail.bind(this));
        action.execute();
    },

    _createSuccess: function(action)
    {
        this.ui.message("info", action.message);
        this.bugs[action.params.id] = action.params;
        this.bugs[action.bug.id] = action.bug;
        this.ui.addBug(action.params.id, action.bug.id);
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

    updateBugs: function(bugIDs)
    {
        var rpc = new Rpc("Tree", "get_tree", {
            ids: bugIDs, depth:0});
        rpc.done(this._updateDone.bind(this));
        rpc.fail(this._updateDone.bind(this));
    },

    _updateDone: function(result)
    {
        if (result.code) {
            this.ui.message("error", "Failed to update bug: " + result.message);
        } else {
            TVP._cleanBugs(result.bugs);
            for (var bugID in result.bugs) {
                this.bugs[bugID] = result.bugs[bugID];
            }
            this.reset();
        }
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
 * After execution the params member will contain the new bug data.
 *
 */
TVP.CreateNewBug = TVP.Action.extend({
    type: "CreateNewBug",

    execute: function()
    {
        var newBug = {};
        // Clone the required fields from parent
        for (var field in TVP._requiredFields) {
            newBug[field] = this.bug.internals[TVP._requiredFields[field]];
        }
        // extend with params
        $.extend(newBug, this.params);
        var rpc = new Rpc("Bug", "create", newBug);
        rpc.done(this._createDone.bind(this));
        rpc.fail(this._createFail.bind(this));
    },

    /**
     * Bug.create() RPC success.
     */
    _createDone: function(result)
    {
        // Get the newly created bug, and updates to parent
        this.params.id = Number(result.id);
        var rpc = new Rpc("Tree", "get_tree", {
            ids: [result.id, this.bug.id], depth:0});
        rpc.done(this._getDone.bind(this));
        rpc.fail(this._getFail.bind(this));
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
     * get_tree() RPC success handler.
     */
    _getDone: function(result)
    {
        TVP._cleanBugs(result.bugs);
        this.params = result.bugs[this.params.id];
        this.bug = result.bugs[this.bug.id];
        this.message = "Successfully created bug" + this.params.id;
        this._successCb.fire(this);
    },

    /**
     * get_tree() RPC failure handler.
     */
    _getFail: function(error)
    {
        this.message = "Failed to get the data for new bug " + this.params.id
            + ": " + error.message;
        this._failCb.fire(this);
    },
});
