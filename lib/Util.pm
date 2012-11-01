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

package Bugzilla::Extension::TreeViewPlus::Util;
use strict;
use base qw(Exporter);
our @EXPORT = qw(
    generate_tree
    get_tree
);


sub generate_tree {
    my ($id, $depth, $direction, $seen) = @_;

    # Set the direction of travelsal, default is from blocked to dependencies
    if (!grep($_ eq $direction, qw(dependson blocked))) {
        $direction = "dependson";
    }
    my $from = $direction eq 'blocked' ? 'dependson' : 'blocked';

    $depth = -1 if !defined $depth;
    $seen = {} unless defined $seen;

    my $tree = {};
    $seen->{$id} = $tree;

    my $dbh = Bugzilla->dbh;
    my $sth = $dbh->prepare(
        "SELECT $direction FROM dependencies ".
        "WHERE $from = ?");
    $sth->execute($id);
    my $child;
    $sth->bind_columns(\$child);
    while ( $sth->fetch ) {
        next if ($depth == 0);
        if (defined $seen->{$child}) {
            $tree->{$child} = $seen->{$child};
        } else {
            $tree->{$child} = generate_tree(
                $child, $depth - 1, $direction, $seen);
        }
    }
    return wantarray ? ($tree, $seen) : $tree;
}

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
    my ($ids, $depth, $direction, $root, $seen) = @_;
    $depth = -1 unless defined $depth;
    $seen = [] unless defined $seen;
    $root = {} unless defined $root;
    return $root if (!@$ids || $depth == 0);

    # Set the direction of travelsal, default is from blocked to dependencies
    $direction ||= 'dependson';
    if (!grep($_ eq $direction, qw(dependson blocked))) {
        $direction = "dependson";
    }
    my $from = $direction eq 'blocked' ? 'dependson' : 'blocked';
    for my $id (@$ids) {
        push(@$seen, $id);
        _add_arc($root, $id);
    }
    my $dbh = Bugzilla->dbh;
    my $depends = $dbh->selectall_arrayref(
        "SELECT $from, $direction FROM dependencies
          WHERE ".$dbh->sql_in($from, $ids)
    );
    my @next;
    for my $arc (@$depends) {
        my ($tail, $head) = @$arc;
        _add_arc($root, $tail, $head);
        push(@next, $head) unless grep($head == $_, @$seen);
    }
    return get_tree(\@next, $depth-1, $direction, $root, $seen);
}

1;

__END__

=head1 NAME

Bugzilla::Extension::TreeViewPlus::Util

=head1 SYNOPSIS

  # get direct dependencies of bug 1
  my $tree = generate_tree(1, 1);
  # get the complete dependency tree of bug 1
  my $tree = generate_tree(1, -1);
  # get two levels of bugs that bug 1 blocks
  my $tree = generate_tree(1, 2, 'blocked')

=head1 DESCRIPTION

This package contains utility functions for working with bug dependency trees.

=head1 FUNCTIONS

=head2 Tree handling

=over

=item C<generate_tree($id, $depth, $direction)>

=over

=item B<Description>

Recursively generates the bug dependency tree

=item B<Params>

=over

=item C<id> - Bug id

=item C<depth> - Maximum depth to go to

=item C<direction> - Direction of the tree travelsal

Either 'blocked', to get the tree of bugs this one blocks, or 'dependson', to
get the tree of bugs this one depends on. Defaults to 'dependson'

=item C<seen> - Hashref where keys present the already seen bug IDs

To prevent following some bug set the value with bugs id key to 1. Usually
this is only used internally in the recursive calls to skip already processed
bugs if they appear more than once in the tree.

=back

=item B<Returns>

Hashref containing the tree stucture.

=back

=back

