
package Bugzilla::Extension::TreeViewPlus::WebService;

use strict;
use warnings;

use base qw(Bugzilla::WebService);

use Bugzilla::Error;
use Bugzilla::Util qw(detaint_natural);
use Bugzilla::Constants;
use Bugzilla::WebService::Util qw(validate);

use Bugzilla::Extension::TreeViewPlus::Util;

sub get_tree {
    my ($self, $params) = validate(@_, 'ids');
    defined $params->{ids}
        || ThrowCodeError('param_required', { param => 'ids' });
    my @ids;
    foreach my $id (@{$params->{ids}}) {
        detaint_natural($id)
            || ThrowCodeError('param_must_be_numeric', { param => 'ids' });
        push(@ids, $id);
        # TODO Check that the bugs exist
    }
    my $maxdepth = $params->{depth};
    my ($direction) = ($params->{dir} =~ /(blocked|dependson)/);

    my $tree = {};
    my $seen = {};
    foreach my $id (@ids) {
        $tree->{$id} = generate_tree($id, $maxdepth, $direction, $seen);
    }

    return { tree => $tree, seen => $seen };
}

sub set_depends {
    my ($self, $params) = @_;
    Bugzilla->login(LOGIN_REQUIRED);

    defined $params->{id}
        || ThrowCodeError('param_required', { param => 'id' });

    my $bug = Bugzilla::Bug->check($params->{id});

    Bugzilla->user->can_edit_product($bug->product_id)
        || ThrowUserError("product_edit_denied", {product => $bug->product});
    #TBD
}

1;
