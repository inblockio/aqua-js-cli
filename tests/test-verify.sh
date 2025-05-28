#!/bin/sh

test_description='Test file verification functionality'

notarize="repo/dist/aqua.js notarize"
verify="repo/dist/aqua.js verify"

. ./tests/sharness/sharness.sh

test_expect_success 'Setup test environment' '
    ln -s $(git rev-parse --show-toplevel) ./repo &&
    cp repo/README.md README.md &&
    cp repo/LICENSE LICENSE &&
    cp repo/notarize.ts notarize.ts
'

test_expect_success 'Check README.md'  '
    test -f README.md
'

test_expect_success 'Create AQUA file for README.md' '
    $notarize README.md &&
    test -f README.md.aqua.json
'


test_expect_success 'Verify the output of verify.js' '
    $verify README.md > actual_output &&
    if tail -n 2 actual_output | grep -q "successfully"; then
        echo "Last or second-to-last line contains '\''successfully'\''";
    else
        echo "Last or second-to-last line does NOT contain '\''successfully'\''" && false;
    fi
'



# Cleanup
test_expect_success 'Cleanup test files' '
    rm -f README.md.aqua.json &&
    rm -f LICENSE.aqua.json &&
    rm -f notarize.ts.aqua.json &&
    rm -f README.md &&
    rm -f LICENSE &&
    rm -f notarize.ts &&
    rm -f actual_output
'

test_done 