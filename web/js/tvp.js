/**
 * TreeViewPlus "namespace"
 */
var TVP = {};

/**
 * Hash that stores complete bug objects fetched via RPC
 */
TVP.bugs = {};

function extName(field)
{
    return FIELD_MAP[field] || field;
}

/**
 * Function to compare two TVP nodes for sorting
 */
TVP.cmpNodes = function(a,b) {
    // TODO: Add support for buglist column ordering
    if (!a.data.in_results && b.data.in_results) {
        return 1;
    } else if (!b.data.in_results && a.data.in_results) {
        return  -1;
    } else {
        return a.data.bug_id > b.data.bug_id ? 1 :
            a.data.bug_id < b.data.bug_id ? -1 : 0;
    }
}

TVP.getNodesByBugID = function(bugID)
{
    var nodes = [];
    TVP.tree.visit(function(node) {
        if (node.data.bug_id == bugID) nodes.push(node);
    }, false);
    return nodes;
}

TVP.openBugInNewWindow = function(id)
{
    window.open("show_bug.cgi?id=" + id, "_blank");
}

TVP.nodeBugGetDone = function(bugID) {
    var bug = TVP.bugs[bugID];
    TVP.getNodesByBugID(bugID).forEach(function(node){
        // Construct title if this node is not loaded
        if (!node.data.columns) {
            node.data.columns = {};
            node.data.title = bug.id;
            DISPLAY_COLUMNS.forEach(function(field) {
                var value = bug.value(extName(field));
                if (value == undefined) value = " ";
                node.data.columns[field] = value;
                node.data.title += " &bull; " + value;
            });
            if (node.isVisible()) node.render();
        }
    });
}

TVP.showNodeButtons = function(node) {
    var buttons = $(node.li).children("span.tvp-buttons");
    if (buttons.size()) {
        buttons.show();
        return;
    }
    // Create buttons if they do not exist
    buttons = $("#tvp-templates .tvp-buttons").clone();
    $('span.dynatree-node', node.li).first().after(buttons);

    buttons.find("a.tvp-open").click(function(){
        TVP.openBugInNewWindow(node.data.bug_id);
    });

    var bug = TVP.bugs[node.data.bug_id];
    var clone = ['product', 'component', 'version'];
    var defaults = {
        severity: BB_CONFIG.default.severity,
        priority: BB_CONFIG.default.priority,
    };
    defaults[TVP_FROM] = bug.id;
    buttons.find("a.tvp-add").bugentry({
        clone: clone,
        defaults: defaults,
        bug: bug,
        title: "Add new dependency to: " + bug.id,
        success: function(ev,result) {TVP.addBugNode(result.bug)},
    });

    buttons.find("a.tvp-edit").bugentry({
        mode: 'edit',
        bug: bug,
        title: "Edit: " + bug.id,
        success: function(ev,result) {TVP.updateBugNode(result.bug)},
    });
}

TVP.addBugNode = function(bug)
{
    TVP.bugs[bug.id] = bug;
    var parents = [];
    var parentIDs = bug.value(TVP_FROM) || [];
    TVP.tree.visit(function(node) {
        if (parentIDs.indexOf(node.data.bug_id) != -1) {
            parents.push(node);
        }
    }, false);
    var nodeData = {
        bug_id: bug.id,
        title: bug.id,
    };
    parents.forEach(function(node) {
        node.addChild(nodeData);
        node.expand();
    });
    TVP.nodeBugGetDone(bug.id);
}

TVP.updateBugNode = function(bug)
{
    TVP.bugs[bug.id] = bug;
    var parents = bug.value(TVP_FROM) || [];
    var children = bug.value(TVP_TO) || [];
    TVP.getNodesByBugID(bug.id).forEach(function(node) {
        var parentID = node.getParent().data.bug_id;
        if (parentID && parents.indexOf(parentID) == -1) {
            node.remove();
            return;
        }
        (node.getChildren() || []).forEach(function(child) {
            if(children.indexOf(child.data.bug_id) == -1) child.remove();
        });
        // TODO add new children
        node.data.columns = null;
    });
    TVP.nodeBugGetDone(bug.id);
}

/**
 * Function de/hilight tree nodes based on bug ID
 */
TVP.highlight = function(bugID, on)
{
    TVP.getNodesByBugID(bugID).forEach(function(node) {
        if (on && !node.isActive()) {
            node.makeVisible();
            $("a.dynatree-title", node.li).first().addClass("tvp-hl-node");
            return 'skip';
        } else {
            $("a.dynatree-title", node.li).first().removeClass("tvp-hl-node");
        }
    });
}

/**
 * Default tree options and event callback functions
 */
TVP.treeData = {
    /**
     * Tree Options
     */
    minExpandLevel: 2,
    debugLevel: 0,

    /**
     * Tree event callbacks
     */
    onRender: function(node, nodeSpan)
    {
        if(!node.data.in_results) $(nodeSpan).css("opacity", "0.5");
    },

    onClick: function(node, ev)
    {
        //Prevent dynatree from stealing focus when buttons are clicked
        if (node.getEventTargetType(ev) == null) return false;
    },

    onDblClick: function(node, ev)
    {
        if (node.getEventTargetType(ev) == null) return false;
        TVP.openBugInNewWindow(node.data.bug_id);
    },

    onActivate: function(node)
    {
        if (TVP.bugs[node.data.bug_id]) {
            TVP.showNodeButtons(node);
        } else {
            var ids = [node.data.bug_id];
            if(!node.data.columns) {
                node.visit(function(child) {
                    if (ids.indexOf(child.data.bug_id) == -1) {
                        ids.push(child.data.bug_id);
                    }
                });
            }
            Bug.get(ids, function(bugs) {
                bugs.forEach(function(bug) {
                    TVP.bugs[bug.id] = bug;
                    TVP.nodeBugGetDone(bug.id);
                })
                TVP.showNodeButtons(node);
            });
        }
        TVP.highlight(node.data.bug_id, true);
    },

    onDeactivate: function(node)
    {
        $(".tvp-buttons", node.li).first().hide();
        TVP.highlight(node.data.bug_id, false);
    },
}



/**
 * TVP page init function
 */
TVP.init = function(tree) {
    $.extend(TVP.treeData, tree);
    $("#tvp_container").dynatree(TVP.treeData);
    TVP.tree = $("#tvp_container").dynatree("getTree");
    TVP.tree.visit(function(node) {
        node.data.bug_id = Number(node.data.bug_id);
    });
    // Sort tree
    TVP.tree.getRoot().sortChildren(TVP.cmpNodes, true);
}




/*******************************************************************************
 * TVP actions
 */

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
 * This action takes parameters in format accepted by Bug.update()
 *      {
 *          depends_on: {
 *              add: [],
 *              remove: [],
 *          },
 *          blocks: {
 *              add: [],
 *              remove: [],
 *          }
 *      }
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

    update: function(params, deep)
    {
        if (!deep) return this.base(params, deep);
        var merge = {
            depends_on: {
                add: [],
                remove: [],
            },
            blocks: {
                add: [],
                remove: [],
            }
        };
        for (var field in merge) {
            for (var op in merge[field]) {
                var ids = params[field] ? params[field][op] || [] : [];
                ids.forEach(function(id) {
                    merge[field][op].push(id);
                });
                ids = this.params[field] ? this.params[field][op] || [] : [];
                ids.forEach(function(id) {
                    merge[field][op].push(id);
                });
            }
        }
        this.params = merge;
        return this._sanitizeParams();
    },

    /**
     * Sanitize the params by removing duplicates.
     */
    _sanitizeParams: function() {
        var clean = {};
        for (var field in this.params) {
            clean[field] = {};
            var add = [];
            var uniq = []
            for (var op in this.params[field]) {
                var ids = [];
                (this.params[field][op] || []).forEach(function(id) {
                    if(uniq.indexOf(id) == -1) {
                        uniq.push(id);
                        ids.push(id);
                    }
                });
                if (ids.length) clean[field][op] = ids;
            }
            if ($.isEmptyObject(clean[field])) delete clean[field];
        }
        this.params = clean;
        return clean;
    },

    /**
     * See Action.execute()
     */
    execute: function()
    {
        var params = this._sanitizeParams();
        if($.isEmptyObject(params)) return;
        params.ids = [this.bug.id];
        var rpc = new Rpc("Bug", "update", params);
        rpc.done($.proxy(this, "_bugUpdateDone"));
        rpc.fail($.proxy(this, "_bugUpdateFail"));
    },

    /**
     * Bug.update() RPC success handler.
     */
    _bugUpdateDone: function(result)
    {
        this.message = "Succesfully changed dependencies of bug "
                + this.bug.id;
        // TODO parse the changes in the message
        this._successCb.fire(this);
    },

    /**
     * Bug.update() RPC failure handler.
     */
    _bugUpdateFail: function(error)
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
    // Non visible fields required when creating new bugs
    _requiredFields: {
        product: 1,
        component: 1,
        version: 1,
    },

    execute: function()
    {
        var newBug = {};
        // Clone the required fields from parent
        for (var field in this._requiredFields) {
            newBug[field] = this.bug[field];
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

/**
 * Action for updating a bug
 *
 * Params should be in the format accepted by Tree.update_bug() RPC call.
 *
 */
TVP.UpdateBug = TVP.Action.extend({
    type: "UpdateBug",

    execute: function()
    {
        this.params.ids = [this.bug.id];
        var rpc = new Rpc("Tree", "update_bug", this.params);
        rpc.done(this._updateDone.bind(this));
        rpc.fail(this._updateFail.bind(this));
    },

    /**
     * update_bug() RPC success handler.
     */
    _updateDone: function(result)
    {
        var changeMessages = [];
        for (var i=0; i < result.bugs.length; i++) {
            if (result.bugs[i].id != this.bug.id) continue;
            var changes = result.bugs[i].changes;
            for (key in changes) {
                this.bug[key] = changes[key].added;
                changeMessages.push(key + " to '" + changes[key].added + "'");
            }
        }
        if (changeMessages.length) {
            this.message = "Successfully changed bug " + this.bug.id + " " +
                    changeMessages.join(", ");
        } else {
            this.message = "No changes made to bug " + this.bug.id;
        }
        this._successCb.fire(this);
    },

    /**
     * update_bug() RPC failure handler.
     */
    _updateFail: function(error)
    {
        this.message = "Failed to update bug " + this.bug.id
            + ": " + error.message;
        this._failCb.fire(this);
    },
});
