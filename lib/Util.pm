# -*- Mode: perl; indent-tabs-mode: nil -*-
#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
#
# Copyright (C) 2012 Jolla Ltd.
# Contact: Pami Ketolainen <pami.ketolainen@jollamobile.com>

package Bugzilla::Extension::TreeViewPlus::Util;
use strict;
use base qw(Exporter);
our @EXPORT = qw(
    get_tree
);

sub _get_node {
    my ($root, $id) = @_;
    my $node = $root->{$id};
    return $node if defined $node;
    for my $child (keys %$root) {
        $node = _get_node($root->{$child}, $id);
        return $node if defined $node;
    }
    return undef;
}

sub _add_arc {
    my ($root, $tail, $head) = @_;
    my $tail_node = _get_node($root, $tail);
    $tail_node = $root->{$tail} = {} unless defined $tail_node;
    if (defined $head) {
        my $head_node = _get_node($root, $head) || {};
        delete $root->{$head} if defined $root->{$head};
        $tail_node->{$head} = $head_node;
    }
}

sub get_tree {
    my ($ids, $dir, $depth, $root, $seen) = @_;
    $dir ||= 'dependson';
    $depth = -1 unless defined $depth;
    $seen = [] unless defined $seen;
    $root = {} unless defined $root;
    return $root if (!@$ids || $depth == 0);

    # Set the direction of travelsal, default is from blocked to dependencies
    my $to = $dir =~ /(dependson|blocked)/ ? $1 : 'dependson';
    my $from = $to eq 'blocked' ? 'dependson' : 'blocked';

    for my $id (@$ids) {
        push(@$seen, $id);
        _add_arc($root, $id);
    }
    my $dbh = Bugzilla->dbh;
    my $depends = $dbh->selectall_arrayref(
        "SELECT $from, $to FROM dependencies
          WHERE ".$dbh->sql_in($from, $ids)
    );
    my @next;
    for my $arc (@$depends) {
        my ($tail, $head) = @$arc;
        _add_arc($root, $tail, $head);
        push(@next, $head) unless grep($head == $_, @$seen);
    }
    return get_tree(\@next, $to, $depth-1, $root, $seen);
}

1;

__END__

=head1 NAME

Bugzilla::Extension::TreeViewPlus::Util

=head1 DESCRIPTION

Tree generation functions

=head1 FUNCTIONS

=head2 C<get_tree($ids, $direction, $depth)>

=over

=item B<Description>

Recursively generates the bug dependency tree

=item B<Params>

=over

=item C<ids> - List of ids to start the tree from

=item C<direction> - Direction of the tree travelsal

=item C<depth> - Maximum depth to go to

Either 'blocked', to get the tree of bugs these block, or 'dependson', to
get the tree of bugs these bus depend on. Defaults to 'dependson'

=back

=item B<Returns>

Hashref containing the tree stucture.

=back


