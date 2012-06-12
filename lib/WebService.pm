
package Bugzilla::Extension::TreeViewPlus::WebService;

use strict;
use warnings;

use base qw(Bugzilla::WebService);

use Bugzilla::Error;
use Bugzilla::Util qw(detaint_natural detaint_signed);
use Bugzilla::Constants;
use Bugzilla::WebService::Util qw(validate);
use Bugzilla::WebService::Bug;

use Bugzilla::Extension::TreeViewPlus::Util qw(generate_tree);

sub get_tree {
    my ($self, $params) = validate(@_, 'ids');
    defined $params->{ids}
        || ThrowCodeError('param_required', { param => 'ids' });
    my $maxdepth = $params->{depth};
    $maxdepth = -1 unless defined $maxdepth;
    detaint_signed($maxdepth)
            || ThrowCodeError('param_must_be_numeric', { param => 'depth' });
    my ($direction) = ($params->{direction} =~ /(blocked|dependson)/);

    my $nodata = $params->{nodata};
    my $includetree = $params->{tree};

    # Verify the given ids
    my @ids;
    my $bugs = {};
    foreach my $id (@{$params->{ids}}) {
        detaint_natural($id)
            || ThrowCodeError('param_must_be_numeric', { param => 'ids' });
        # We need to check these, even if we don't want the data
        my $bug = Bugzilla::Bug->check($id);
        if ($nodata) {
            $bugs->{$id} = undef;
        } else {
            $bugs->{$id} = $self->_bug_to_hash($bug);
        }
        push(@ids, $id);
    }

    # Get the tree
    my $tree = {};
    foreach my $id (@ids) {
        my $seen = {};
        $tree->{$id} = generate_tree($id, $maxdepth, $direction, $seen);

        # Fetch the data for other bugs in the tree, if we want it
        foreach my $id (keys %{$seen}) {
            if ($nodata) {
                $bugs->{$id} = undef;
            } else {
                next if defined $bugs->{$id};
                # TODO don't fail the whole request if bug is not visible to
                # current user
                my $bug = Bugzilla::Bug->check($id);
                $bugs->{$id} = $self->_bug_to_hash($bug);
            }
        }
    }

    my $result = { bugs => $bugs };
    if ($includetree) {
        $result->{tree} = $tree;
    }
    return $result;
}

sub set_dependencies {
    my ($self, $params) = @_;
    Bugzilla->login(LOGIN_REQUIRED);

    defined $params->{id}
        || ThrowCodeError('param_required', { param => 'id' });

    my $bug = Bugzilla::Bug->check($params->{id});

    Bugzilla->user->can_edit_product($bug->product_id)
        || ThrowUserError("product_edit_denied", {product => $bug->product});

    if (defined $params->{dependson} || defined $params->{blocked}) {
        $bug->set_dependencies(scalar $params->{dependson},
                                scalar $params->{blocked});
    }
    my $dbh = Bugzilla->dbh;
    $dbh->bz_start_transaction();
    my $timestamp = $dbh->selectrow_array(q{SELECT LOCALTIMESTAMP(0)});
    my $changes = $bug->update($timestamp);

    $dbh->bz_commit_transaction();

    return $changes;
}



my %API_KEYS = (
    summary => "short_desc",
    status => "bug_status",
    resolution => undef,
    severity => "bug_severity",
    assigned_to => undef,
    comment => undef, # This is not directly a bug field
);


sub update_bug {
    my ($self, $params) = validate(@_, 'ids');

    if (BUGZILLA_VERSION =~ /^4\..*/) {
        return Bugzilla::WebService::Bug::update($self, $params);
    }

    my $user = Bugzilla->login(LOGIN_REQUIRED);

    my $ids = delete $params->{ids};
    defined $ids || ThrowCodeError('param_required', { param => 'ids' });

    my @bugs = map { Bugzilla::Bug->check($_) } @$ids;
    my %values = %$params;

    # Remove unsupported keys and convert api key -> to bug field if needed
    for my $key (keys %values) {
        if (!grep(/^$key$/, keys %API_KEYS)) {
            delete $values{$key};
        }
        #elsif (defined $API_KEYS{$key}) {
        #    $values{$API_KEYS{$key}} = delete $values{$key};
        #}
    }

    # Extract comment if provided
    my %comment;
    %comment = %{delete $values{comment}} if (ref $values{comment} eq "HASH");
    if (exists $comment{comment}) {
        $comment{body} = delete $comment{comment};
    }

    foreach my $bug (@bugs) {
        if (!$user->can_edit_product($bug->product_obj->id) ) {
            ThrowUserError("product_edit_denied",
                          { product => $bug->product });
        }
        # Handle special cases
        if (exists $comment{body}) {
            $bug->add_comment($comment{body},
                { isprivate => $comment{is_private} });
        }
        if (exists $values{status}) {
            # Status and reolution needs to be set
            $bug->set_status(delete $values{status},
                {resolution => delete $values{resolution}}
            );
        }
        # Set the rest in bulk
        $bug->set_all(\%values);
    }

    my $dbh = Bugzilla->dbh;
    my %all_changes;
    $dbh->bz_start_transaction();
    foreach my $bug (@bugs) {
        $all_changes{$bug->id} = $bug->update();
    }
    $dbh->bz_commit_transaction();

    my @result;
    my %api_name = reverse %API_KEYS;
    foreach my $bug (@bugs) {
        my %hash = (
            id               => $self->type('int', $bug->id),
            last_change_time => $self->type('dateTime', $bug->delta_ts),
            changes          => {},
        );

        # alias is returned in case users pass a mixture of ids and aliases,
        # so that they can know which set of changes relates to which value
        # they passed.
        if (Bugzilla->params->{'usebugaliases'}) {
            $hash{alias} = $self->type('string', $bug->alias);
        }
        else {
            # For API reasons, we always want the alias field to appear, we
            # just don't want it to have a value if aliases are turned off.
            $hash{alias} = $self->type('string', '');
        }

        my %changes = %{ $all_changes{$bug->id} };
        foreach my $field (keys %changes) {
            my $change = $changes{$field};
            my $api_field = $api_name{$field} || $field;
            # We normalize undef to an empty string, so that the API
            # stays consistent for things like Deadline that can become
            # empty.
            $change->[0] = '' if !defined $change->[0];
            $change->[1] = '' if !defined $change->[1];
            $hash{changes}->{$api_field} = {
                removed => $self->type('string', $change->[0]),
                added   => $self->type('string', $change->[1])
            };
        }

        push(@result, \%hash);
    }

    return { bugs => \@result };

}

sub _bug_to_hash {
    my ($self, $bug) = @_;
    my $bug_hash = Bugzilla::WebService::Bug::_bug_to_hash($self, $bug);
    # Include dependson and blocked info
    $bug_hash->{dependson} = $bug->dependson;
    $bug_hash->{blocked} = $bug->blocked;
    return $bug_hash;
}
1;

__END__

=head1 NAME

Bugzilla::Extension::TreeViewPlus::WebService - The API for handling bug
dependencies

=head1 DESCRIPTION

This webservice provides methods for fetching the dependson or blocks trees for
bugs and modifying the bug dependencies.

The methods are exposed under 'Tree' namespace in the RPC interface.

=head1 METHODS

See L<Bugzilla::WebService> for a description of how parameters are passed,
and what B<STABLE>, B<UNSTABLE>, and B<EXPERIMENTAL> mean.

=head2 Dependency related functions

=over

=item C<get_tree>

=over

=item B<EXPERIMENTAL>

=item B<Description>

Get dependency tree for bug(s).

=item B<Params>

=over

=item C<ids> (array) - List of bug ids to get the dependency trees from

=item C<depth> (integer) - Maximum depth to go into the tree.

Default is -1 for full tree.

=item C<direction> (string) - Direction of the dependency tree

Either 'dependson' or 'blocked'. Default is 'dependson'

=over

=item C<dependson> - Trees of bugs that requested bugs depend on

=item C<blocked> - Trees of bugs that requested bugs block

=back

=item C<nodata> (boolean) - If true, bug data is not included

In this case the bugs hash in result will only have the bug ids as keys pointing
to null values.

=item C<tree> (boolean) - If true, the plain tree sturcture is included

In addition to the standard 'bugs' field the return hash will also contain
'tree' field that contains the plain tree structure presented with bug ids
in a hash. This is usefull for faster fetching of large structures with
'nodata' option when we are interested only in the bug ids and relations.

=back

=item B<Returns>

A hash containing field 'bugs' and optionally 'tree' if tree parameter was given

=over

=item C<bugs> - Hash containing bug id -> bug data or undef

Bug data has the same format as return values of
L<Bug.get|Bugzilla::WebService::Bug/get>,
plus two extra fields 'dependson' and 'blocked'

If 'nodata' was set, values are undef

=item C<tree> - Hash containing the dependency trees

For example if we have bugs 1, 2, 3 and 4. Bug 1 depends on 2 and 3, and bug 3
depends on 4. The tree from get_tree({ids => [1,2], tree => 1} would be
following:

  {
  1 => {
       2 => {},
       3 => {
            4 => {}
            }
       },
  2 => {}
  }

=back

=back



=item C<set_dependencies>

=over

=item B<EXPERIMENTAL>

=item B<Description>

Set bug dependencies.

=item B<Params>

=over

=item C<id> (integer) - ID of the bug to set the dependencies

=item C<dependson> (array) - List of bug IDs this bug depends on

=item C<blocked> (array) - List of bug IDs this bug blocks

=back

=item B<Returns>

Hash describing the changes

  {
  dependson => [[added ids], [removed ids]],
  blocked => [[added ids], [removed ids]]
  }

=back

=back
