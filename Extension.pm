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
use Bugzilla::Bug;

use JSON qw(encode_json);

our $VERSION = '0.01';

use constant COL_MAP => {
    # columns which are not in the FIELD_MAP
    assigned_to_realname => 'assigned_to',
    changeddate          => 'last_change_time',
    opendate             => 'creation_time',
    qa_contact_realname  => 'qa_contact',
    reporter_realname    => 'creator',
    short_short_desc     => 'summary',

    map { Bugzilla::Bug::FIELD_MAP->{$_} => $_ } keys %{ Bugzilla::Bug::FIELD_MAP() }
};



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
    $vars->{field_map_json} = encode_json(COL_MAP);
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
            $result{title} .= " &bull; ".
                    join(" &bull; ", map(defined $bug->{$_} ? $bug->{$_} : '---', @$columns));
        }
    }

    my @children = map {_dynatree($buginfo, $columns, $node->{$_}, $_)} keys %$node;
    $result{children} = \@children;
    return \%result;
}

sub webservice {
    my ($self, $args) = @_;
    $args->{dispatch}->{Tree} = "Bugzilla::Extension::TreeViewPlus::WebService";
}

__PACKAGE__->NAME;
