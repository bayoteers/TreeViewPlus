# -*- Mode: perl; indent-tabs-mode: nil -*-
#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
#
# Copyright (C) 2012 Jolla Ltd.
# Contact: Pami Ketolainen <pami.ketolainen@jollamobile.com>

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
    return unless ($params->{file} eq 'list/list-tvp.html.tmpl');

    my $vars = $params->{vars};
    my @bug_ids;
    my %buginfo;
    for my $bug (@{$vars->{bugs}}) {
        $buginfo{$bug->{bug_id}} = $bug;
        push(@bug_ids, $bug->{bug_id});
    }
    my $dir = Bugzilla->cgi->param('tvp_dir') || '';

    $vars->{tree_json} = encode_json(
        _dynatree(\%buginfo, $vars->{displaycolumns},
        get_tree(\@bug_ids, $dir)));

    $vars->{bug_info_json} = encode_json(\%buginfo);
    $vars->{displaycolumns_json} = encode_json($vars->{displaycolumns});
    $vars->{field_map_json} = encode_json(COL_MAP);
    $vars->{tvp_to} = $dir eq 'blocked' ? 'blocks' : 'depends_on';
    $vars->{tvp_from} = $dir eq 'blocked' ? 'depends_on' : 'blocks';
}


## Generates the data sturcture suitable for jQuery dynatree
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
        }
    }

    my @children = map {_dynatree($buginfo, $columns, $node->{$_}, $_)} keys %$node;
    $result{children} = \@children;
    return \%result;
}

__PACKAGE__->NAME;
