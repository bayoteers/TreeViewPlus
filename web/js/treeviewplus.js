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
     * @param {string} type Tree type "dependson" or "blocked"
     */
    constructor: function(element, options)
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
        this.elements.heading = $("<h1/>");
        this.elements.tree.prepend(this.elements.heading);
        this.elements.messageList = $("ul#tree-messages");

        // TODO Use template for this
        this.elements.childForm = $("<form/>");
        this.elements.childForm.attr("action", "enter_bug.cgi");
        this.elements.childForm.attr("target", "_blank");
        this.elements.childForm.attr("method", "POST");
        this.elements.childForm.append("<input name='product'/>");
        this.elements.childForm.append("<input name='component'/>");
        this.elements.childForm.append("<input name='blocked'/>");
        this.elements.childForm.append("<input name='dependson'/>");

        this.controller = new TVP.TreeController(this);
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
        this.setHeading("");
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
        var span = $("<span class='buttons'/>");
        span.hide();
        var link = $("<a href='#' title='Open in new window'>[O]</a>");
        link.click(this.openBugInNewWindow.bind(this));
        span.append(link);
        link = $("<a href='#' title='Create child'>[C]</a>");
        link.click(this.openNewChildBug.bind(this));
        span.append(link);
        $(nodeSpan).after(span);
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
        this.elements.childForm.find("[name='product']").val(
                bug.product);
        this.elements.childForm.find("[name='component'").val(
                bug.component);
        if (this.options.type == "dependson") {
            this.elements.childForm.find("[name='dependson']").val("");
            this.elements.childForm.find("[name='blocked']").val(
                    bug.id);
        } else {
            this.elements.childForm.find("[name='blocked']").val("");
            this.elements.childForm.find("[name='dependson']").val(
                    bug.id);
        }
        this.elements.childForm.submit();
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
     * Set the tree heading
     */
    setHeading: function(text)
    {
        this.elements.heading.html(text);
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
    constructor: function(ui)
    {
        this.ui = ui;
        this.bugs = {};
        this._roots = [];
        this._actions = [];
    },
    /**
     * Populates the tree with Tree.get_tree() RPC method.
     *
     * @param {Array.<number>} bugIDs - List of bug IDs to fetch
     */
    init: function(bugIDs)
    {
        this._roots = $.map(bugIDs, Number);
        this.ui.clear();
        var rpc = new Rpc("Tree", "get_tree",
                { ids: bugIDs, direction: this.ui.options.type });
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

        for (var i=0; i < this._roots.length; i++) {
            this.ui.addBug(this._roots[i]);
        }
        // Set title
        var type = this.ui.options.type == "dependson" ? "Dependency": "Blocker";
        var many = this._roots.length > 1 ? "s " : " ";
        this.ui.setHeading(type + " tree for bug" + many + this._roots.join(", "));
    },

    changeParent: function(change, fromID, parentID)
    {
        var type = this.ui.options.type == "dependson" ? "blocked" : "dependson";
        var params = {};
        params[type] = {};
        params[type][parentID] = change;
        // Get existing action and update params or create new
        var action;
        for (var i = 0; i < this._actions.length; i++) {
            if (this._actions[i].bug.id == fromID) {
                action = this._actions[i];
                break;
            }
        }
        if (action) {
            action.update(params);
        } else {
            action = new TVP.ChangeDependencies(this.bugs[fromID], params);
            action.onSuccess(this._changeDepSuccess.bind(this));
            action.onFailure(this._changeDepFail.bind(this));
            this._actions.push(action);
        }
    },

    _changeDepSuccess: function(bug, changes)
    {
        this.bugs[bug.id] = bug;
        this.ui.message("info", "Succesfully changed dependencies of bug "
                + bug.id);
    },

    _changeDepFail: function(bug, error)
    {
        this.ui.message("error", "Failed to changes dependencies of bug "
                + bug.id + ": " + error);
    },

    executeActions: function()
    {
        for (var i = 0; i < this._actions.length; i++) {
            this._actions[i].execute();
        }
        this._actions = [];
    },
});


/**
 * Base class for bug modification actions.
 *
 * Action classes are used as helper for deferred and asynchronous modifications
 * to bugs.
 */
TVP.Action = Base.extend({
    constructor: function(bug, params)
    {
        this.base();
        this.bug = $.extend({}, bug);
        this.params = params || {};
        this._successCb = jQuery.Callbacks();
        this._failCb = jQuery.Callbacks();
    },

    /**
     * Update the action parameters.
     * @param {object} params New parameters to merge into existing
     * @param {Boolean} deep If true, make a deep merge. See jQuery.extend()
     */
    update: function(params, deep)
    {
        var deep = deep == undefined ? true : Boolean(deep);
        $.extend(deep, this.params, params);
    },

    /**
     * Executes the action.
     */
    execute: function()
    {
        // Impelement in derived class
    },

    /**
     * Bind callback to fire on successful execution of the action.
     *
     * The callback gets the modified bug object as first argument and made changes
     * as the second argument.
     */
    onSuccess: function(callback)
    {
        this._successCb.add(callback);
    },

    /**
     * Bind callback to fire on failure to execute the action.
     *
     * The callback gets the modified bug object as first argument and error
     * message as the second argument.
     */
    onFailure: function(callback)
    {
        this._failCb.add(callback);
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
     * Adds dependency
     */
    _add: function(key, bugID)
    {
        var bugID = Number(bugID);
        if (this.bug[key].indexOf(bugID) != -1) return false;
        this.bug[key].push(bugID);
        return true;
    },

    /**
     * Removes dependency
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
        this._successCb.fire(this.bug, result);
    },

    /**
     * set_dependencies() RPC failure handler.
     */
    _setDepsFail: function(error)
    {
        console.log(error);
        this._failCb.fire(this.bug, error.message);
    }
});
