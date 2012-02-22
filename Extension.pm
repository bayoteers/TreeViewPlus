# -*- Mode: perl; indent-tabs-mode: nil -*-
#
# The contents of this file are subject to the Mozilla Public
# License Version 1.1 (the "License"); you may not use this file
# except in compliance with the License. You may obtain a copy of
# the License at http://www.mozilla.org/MPL/
#
# Software distributed under the License is distributed on an "AS
# IS" basis, WITHOUT WARRANTY OF ANY KIND, either express or
# implied. See the License for the specific language governing
# rights and limitations under the License.
#
# The Original Code is the TreeViewPlus Bugzilla Extension.
#
# The Initial Developer of the Original Code is Pami Ketolainen
# Portions created by the Initial Developer are Copyright (C) 2012 the
# Initial Developer. All Rights Reserved.
#
# Contributor(s):
#   Pami Ketolainen <pami.ketolainen@gmail.com>

package Bugzilla::Extension::TreeViewPlus;
use strict;
use base qw(Bugzilla::Extension);

# This code for this is in ./extensions/TreeViewPlus/lib/Util.pm
use Bugzilla::Extension::TreeViewPlus::Util;

our $VERSION = '0.01';

# See the documentation of Bugzilla::Hook ("perldoc Bugzilla::Hook" 
# in the bugzilla directory) for a list of all available hooks.
#sub install_update_db {
#    my ($self, $args) = @_;
#}

sub page_before_template {
    my ($self, $args) = @_;
    my ($vars, $page) = @$args{qw(vars page_id)};
    if ($page eq "treeviewplus/basic.html") {
        $vars->{tvp_bug_ids} = "";
        $vars->{tvp_type} = "dependson";
        my $cgi = Bugzilla->cgi;
        if ($cgi->param('bug_ids')) {
            $vars->{tvp_bug_ids} = $cgi->param('bug_ids');
        }
        if ($cgi->param('direction')) {
            $vars->{tvp_type} = $cgi->param('direction');
        }
    }
    return;
}

sub webservice {
    my ($self, $args) = @_;
    $args->{dispatch}->{Tree} = "Bugzilla::Extension::TreeViewPlus::WebService";
}

__PACKAGE__->NAME;
