
/**
 * Class for creating a bug dependency tree.
 */
var BugTree = Base.extend({
    /**
     * Constructor
     * @param element DOM element, or selector, where tree is rendered.
     * @param options BugTree options.
     *
     *
     * BugTree options:
     * <ul>
     *   <li>treeType - Type of the tree.
     *       "blocked" or "dependson" (default)</li>
     * </ul>
     */
    constructor: function(element, options)
    {
        options = options || {};
        this._treeContainer = $(element).first();
        if (this._treeContainer.size() == 0) {
            throw("Tree container element '" + element + "' not found");
        }
        this.treeType = options.type || "dependson";
        if (["dependson", "blocked"].indexOf(this.treeType) == -1) {
            throw("Unknow treeType '" + this.treeType + "'");
        }

        // Initialize dynatree
        this._treeContainer.dynatree({
            onCreate: this._onCreate.bind(this),
            onKeypress: this._onKeyPress.bind(this),
            dnd: {
                preventVoidMoves: true,
                onDrop: this._onDrop.bind(this),
                // Needed for DnD support
                onDragStart:function(){return true;},
                onDragEnter:function(){return true;},
                onDragOver: function(node, sourceNode, hitMode) {
                    // Just to show that dropping node under it self is a no-no
                    if (node.isDescendantOf(sourceNode)) return false;
                },
            },
        });
        this._tree = this._treeContainer.dynatree("getTree");
        this._messageContainer = $("ul#tree_messages");
        if (this._messageContainer.size() == 0) {
            this._messageContainer = $("<ul id='tree_messages'/>");
            this._treeContainer.append(this._messageContainer);
        }
    },

    /**
     * Called after node has been created in dynatree
     */
    _onCreate: function(node, nodeSpan) {
        // TODO Add the customm stuff here after node has been created
    },

    /**
     * Handles key commands on dynatree
     */
    _onKeyPress: function(node)
    {
        // TODO Handle keyboard actions here
    },

    /**
     * Called when node is dropped somewhere on tree.
     */
    _onDrop: function(node, sourceNode, hitMode, ui, draggable)
    {
        if (node.isDescendantOf(sourceNode)) return false;
        sourceNode.move(node, hitMode);
        if (hitMode == "over") {
            // Expand target node
            node.expand(true);
        }
    },

    /**
     * Populates the tree with Tree.get_tree() RPC method.
     *
     * @param {Array.<number>} bug_ids - List of bug IDs to fetch
     */
    fetchBugs: function(bug_ids)
    {
        var rpc = new Rpc("Tree", "get_tree",
                { ids: bug_ids, direction: this.treeType });
        rpc.done(this._setTreeData.bind(this));
        rpc.fail(this._treeFetchFailed.bind(this));
    },

    /**
     * Displays error message in case fetching the bug tree failed.
     *
     * @param {Object} error JSON RPC error object
     */
    _treeFetchFailed: function(error)
    {
        this.message("error", error.message);
    },

    /**
     * Processes the data from RPC call and populates the tree.
     *
     * @param {Object} result JSON RPC result object from Tree.get_tree()
     */
    _setTreeData: function(result)
    {
        this.bugs = result.bugs;
        // Clear tree
        var root = this._tree.getRoot();
        root.removeChildren();

        for (var bug_id in result.tree) {
            this.addBug(root, bug_id, result.tree[bug_id]);
        }
    },

    /**
     * Adds bug in the tree as child of given node.
     *
     * @param {dtnode} node The parent node.
     * @param {number} bug_id ID of this bug.
     * @param {Object.<number, Object>} children Child bugs to be added under
     *      the new node reqursively.
     * @returns {dtnode} The new node.
     *
     * Bug inforamtaion is expected to be found in this.bugs with the id.
     *
     * Children object is expected to have the same format as tree structure as
     * returned from Tree.get_tree RPC.
     */
    addBug: function(node, bug_id, children)
    {
        var bug = this.bugs[bug_id];
        var title = bug.id + " - " + bug.summary;
        var new_node = node.addChild({
            title: title,
            expand: true,
            unselectable: Boolean(bug.treeNodes && bug.treeNodes.length),
            bug: bug,
        });
        if (bug.tree_nodes) {
            bug.treeNodes.push(new_node);
        } else {
            bug.treeNodes = [new_node];
        }
        for (var child_id in children){
            this.addBug(new_node, child_id, children[child_id]);
        }
        return new_node;
    },

    /**
     * Displays message in the message box.
     *
     * @param {string} type Used as a class for the message element.
     * @param {string} message The message to display.
     *
     * XXX Maybe this should be somewhere else
     */
    message: function(type, message)
    {
        var mElement = $("<li/>");
        mElement.addClass(type);
        mElement.html(message);
        this._messageContainer.prepend(mElement);
        mElement.delay(5000).fadeOut("slow", function() {
            $(this).remove();
        });
    }
});
