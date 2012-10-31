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
use JSON qw(encode_json);

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

sub template_before_process {
    my ($self, $params) = @_;
    return unless ($params->{file} eq 'list/tvp.html.tmpl');

    my $vars = $params->{vars};
    my @bug_ids;
    my %buginfo;
    for my $bug (@{$vars->{bugs}}) {
        $buginfo{$bug->{bug_id}} = $bug;
        push(@bug_ids, $bug->{bug_id});
    }
    $vars->{tree_json} = encode_json(
        _dynatree(\%buginfo, $vars->{displaycolumns}, get_tree(\@bug_ids)));

    $vars->{bug_info_json} = encode_json(\%buginfo);
    $vars->{displaycolumns_json} = encode_json($vars->{displaycolumns});
    my %fieldmap = (
        assigned_to_realname => 'assigned_to',
        short_short_desc     => 'summary',
        bug_status           => 'status',
        changeddate          => 'last_change_time',
        #TODO add all columns which have matching field in RPC bug object
    );
    for my $field (keys %Bugzilla::Bug::FIELD_MAP) {
        $fieldmap{Bugzilla::Bug::FIELD_MAP->{$field}} = $field;
    }
    $vars->{field_map_json} = encode_json(\%fieldmap);
    my $entry_fields = [split(/\s/, Bugzilla->params->{tvp_bug_entry_fields})];
    $vars->{bug_entry_fields} = encode_json($entry_fields);
}

sub _dynatree {
    my ($buginfo, $columns, $node, $id) = @_;
    my %result;
    if (defined $id ) {
        $result{bug_id} = $id;
        $result{href} = "show_bug.cgi?id=$id";
        $result{title} = $id;
        my $bug = $buginfo->{$id};
        if (defined $bug) {
            $result{in_results} = 1;
            $result{columns} = $bug;
            $result{title} .= " | ".
                    join(" | ", map(defined $bug->{$_} ? $bug->{$_} : '---', @$columns));
        }
    }

    my @children = map {_dynatree($buginfo, $columns, $node->{$_}, $_)} keys %$node;
    $result{children} = \@children;
    return \%result;
}

sub config_add_panels {
    my ($self, $args) = @_;
    my $modules = $args->{panel_modules};
    $modules->{TreeViewPlus} = "Bugzilla::Extension::TreeViewPlus::Config";
}

sub webservice {
    my ($self, $args) = @_;
    $args->{dispatch}->{Tree} = "Bugzilla::Extension::TreeViewPlus::WebService";
}

__PACKAGE__->NAME;
