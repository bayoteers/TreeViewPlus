
package Bugzilla::Extension::TreeViewPlus::WebService;

use strict;
use warnings;

use base qw(Bugzilla::WebService);

use Bugzilla::Error;
use Bugzilla::Util qw(detaint_natural);
use Bugzilla::Constants;
use Bugzilla::WebService::Util qw(validate);
use Bugzilla::WebService::Bug;

use Bugzilla::Extension::TreeViewPlus::Util qw(generate_tree);

sub get_tree {
    my ($self, $params) = validate(@_, 'ids');
    defined $params->{ids}
        || ThrowCodeError('param_required', { param => 'ids' });
    my @ids;
    my $bugs = {};
    foreach my $id (@{$params->{ids}}) {
        detaint_natural($id)
            || ThrowCodeError('param_must_be_numeric', { param => 'ids' });
        my $bug = Bugzilla::Bug->check($id);
        $bugs->{$id} = $self->_bug_to_hash($bug);
        push(@ids, $id);
    }
    my $maxdepth = $params->{depth};
    my ($direction) = ($params->{dir} =~ /(blocked|dependson)/);

    my $tree = {};
    my $seen = {};
    foreach my $id (@ids) {
        $tree->{$id} = generate_tree($id, $maxdepth, $direction, $seen);
    }
    foreach my $id (keys %{$seen}) {
        next if defined $bugs->{$id};
        my $bug = Bugzilla::Bug->check($id);
        $bugs->{$id} = $self->_bug_to_hash($bug);
    }

    return { tree => $tree, seen => $seen, bugs => $bugs };
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


sub _bug_to_hash {
    my ($self, $bug) = @_;
    my $bug_hash = Bugzilla::WebService::Bug::_bug_to_hash($self, $bug);
    # Include dependson and blocked info
    $bug_hash->{dependson} = $bug->dependson;
    $bug_hash->{blocked} = $bug->blocked;
    return $bug_hash;
}
1;
