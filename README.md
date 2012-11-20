TreeViewPlus Bugzilla Extension
===============================

TreeViewPlus extension provides alternative to Bugzilla built in treeview of
bug dependencies. The features include:

*   Easily open dependency tree view from any bug or bug list
*   Drag and drop editing of the bug dependency structure in the tree view
*   Editing of bugs straight from the tree view


Installation
------------

This extension requires [BayotBase](https://github.com/bayoteers/BayotBase)
extension, so install it first.

1.  Put extension files in

        extensions/TreeViewPlus

2.  Patch Bugzilla to provide dependency inclusion in custom search. From
    Bugzilla root directory run

        $ patch -p1 < extensions/TreeViewPlus/search_include_dependencies.patch

3.  Run checksetup.pl

4.  Restart your webserver if needed (for exmple when running under mod_perl)

    
Included Libraries
------------------

*   [jQuery Dynatree plugin](http://code.google.com/p/dynatree/)

