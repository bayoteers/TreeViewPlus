/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Copyright (C) 2012 Jolla Ltd.
 * Contact: Pami Ketolainen <pami.ketolainen@jollamobile.com>
 */

/**
 * TreeViewPlus "namespace"
 */
var TVP = {
    // Hash that stores complete bug objects fetched via RPC
    bugs: {}
};

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
            DISPLAY_COLUMNS.forEach(function(name) {
                try {
                    var value = bug.value(name);
                } catch(e) {
                    var value = " ";
                }
                node.data.columns[name] = value;
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
        severity: BB_CONFIG.defaults.severity,
        priority: BB_CONFIG.defaults.priority
    };
    defaults[TVP_FROM] = bug.id;
    buttons.find("a.tvp-add").bugentry({
        clone: clone,
        defaults: defaults,
        bug: bug,
        title: "Add new dependency to: " + bug.id,
        success: function(ev,result) {TVP.addBugNode(result.bug)}
    });

    buttons.find("a.tvp-edit").bugentry({
        mode: 'edit',
        bug: bug,
        title: "Edit: " + bug.id,
        success: function(ev,result) {TVP.updateBugNode(result.bug)}
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
        title: bug.id
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
            $(".dynatree-title", node.li).first().addClass("tvp-hl-node");
            return 'skip';
        } else {
            $(".dynatree-title", node.li).first().removeClass("tvp-hl-node");
        }
    });
}

TVP.loadAll = function()
{
    var incomplete = [];
    TVP.tree.getRoot().visit(function(node) {
        if (!node.data.columns) {
            incomplete.push(node.data.bug_id);
        }
    });
    if (incomplete.length) {
        Bug.get(incomplete, function(bugs) {
            bugs.forEach(function(bug) {
                TVP.bugs[bug.id] = bug;
                TVP.nodeBugGetDone(bug.id);
            });
        })
    }
}

/**
 * Called when dragging of node starts.
 */
TVP.onDragStart = function(node)
{
    if (!TVP.dndEnabled) return false;
    var parentNode = node.getParent();
    if (parentNode == TVP.tree.getRoot()) return true;
    node.data.old_parent = parentNode.data.bug_id;
    return true;
}

/**
 * Called when node is dropped somewhere on tree.
 */
TVP.onDrop = function(target, source, hitMode)
{
    if (target.isDescendantOf(source)) return false;
    if (hitMode == "over") {
        // Expand target node
        target.expand(true);
    } else {
        hitMode = "over";
        target = target.getParent();
    }
    source.move(target, hitMode);
    if (target != TVP.tree.getRoot()) {
        source.data.new_parent = target.data.bug_id;
    }
    return true;
}

TVP.onDragStop = function(node)
{
    var add = node.data.new_parent;
    var remove = node.data.old_parent;
    node.data.old_parent = node.data.new_parent = null;

    if (!(add || remove) || add == remove) return;
    if (!TVP.bugs[node.data.bug_id]){
        Bug.get(node.data.bug_id, function(bug) {
            TVP.bugs[bug.id] = bug;
            TVP.changeBugParent(bug, add, remove);
        });
    } else {
        TVP.changeBugParent(TVP.bugs[node.data.bug_id], add, remove);
    }
}

TVP.changeBugParent = function(bug, add, remove)
{
    if (add) bug.add(TVP_FROM, add);
    if (remove) bug.remove(TVP_FROM, remove);
    var saving = bug.save();
    if (saving) saving.done(TVP.updateBugNode);
}

/**
 * Default tree options and event callback functions
 */
TVP.treeData = {
    /**
     * Tree Options
     */
    minExpandLevel: 1,
    debugLevel: 0,

    /**
     * Tree event callbacks
     */
    onRender: function(node, nodeSpan)
    {
        if(!node.data.in_results) $(nodeSpan).css("opacity", "0.5");
        if (node.data.columns) {
            // Add Bugzilla bug CSS classes
            ['bug_status', 'resolution', 'priority', 'bug_severity']
                .forEach(function(col) {
                    if (node.data.columns[col])
                        $(".dynatree-title", nodeSpan)
                        .addClass("bz_" + node.data.columns[col]);
                });
        }
    },

    onCustomRender: function(node)
    {
        var title = node.data.bug_id;
        if (node.data.columns) {
            DISPLAY_COLUMNS.forEach(function(col) {
                title += " &bull; " + node.data.columns[col];
            });
        }
        return $("<p>").append(
                $("<a class='dynatree-title'>")
                    .attr("href", node.data.href || "#")
                    .html(title)
                ).html();
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

    dnd: {
        preventVoidMoves: true,
        onDragStart: TVP.onDragStart,
        onDragStop: TVP.onDragStop,
        onDrop: TVP.onDrop,
        // Needed for the dragging visual guides
        onDragEnter:function(){return true;},
        onDragOver: function(node, sourceNode, hitMode) {
            // Just to show that dropping node under it self is a no-no
            var notParent = true;
            node.visitParents(function(parentNode) {
                if(parentNode.data.bug_id == sourceNode.data.bug_id) {
                    notParent = false;
                    return false;
                }
            });
            return notParent;
        }
    }
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
    $("#tvp_dnd_switch").prop("disabled", false).change(function() {
        TVP.dndEnabled = $(this).prop("checked");
    });
    $("#tvp_expand").click(function() {
        TVP.tree.visit(function(node) {
            node.expand(true);
        });
    });
    $("#tvp_collapse").click(function() {
        TVP.tree.visit(function(node) {
            node.expand(false);
        });
    });
    $("#tvp_load").click(TVP.loadAll);
}



