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

=head1 DESCRIPTION

Tree generation functions

=head1 FUNCTIONS

=head2 C<get_tree($ids, $depth, $direction)>

=over

=item B<Description>

Recursively generates the bug dependency tree

=item B<Params>

=over

=item C<ids> - List of ids to start the tree from

=item C<depth> - Maximum depth to go to

=item C<direction> - Direction of the tree travelsal

Either 'blocked', to get the tree of bugs these block, or 'dependson', to
get the tree of bugs these bus depend on. Defaults to 'dependson'

=back

=item B<Returns>

Hashref containing the tree stucture.

=back


