#!/bin/sh

test_description='Test file linking functionality'

. ./tests/sharness/sharness.sh

notarize="repo/dist/aqua.js notarize"
verify="repo/dist/aqua.js verify"

test_expect_success 'Setup test environment' '
    ln -s $(git rev-parse --show-toplevel) ./repo &&
    cp repo/README.md README.md &&
    cp repo/LICENSE LICENSE &&
    cp repo/notarize.ts notarize.ts
'

test_expect_success 'Create AQUA file for README.md' '
    $notarize README.md &&
    test -f README.md.aqua.json
'

test_expect_success 'Create AQUA file for LICENSE' '
    $notarize LICENSE &&
    test -f LICENSE.aqua.json
'

test_expect_success 'Create AQUA file for notarize.ts' '
    $notarize notarize.ts &&
    test -f notarize.ts.aqua.json
'

test_expect_success 'Create link between files' '
    $notarize --link LICENSE,notarize.ts README.md &&
    test -f README.md.aqua.json
'

test_expect_success 'Verify linked README.md' '
    $verify README.md
'

# Cleanup
test_expect_success 'Cleanup test files' '
    rm -f README.md.aqua.json &&
    rm -f LICENSE.aqua.json &&
    rm -f notarize.ts.aqua.json &&
    rm -f README.md &&
    rm -f LICENSE &&
    rm -f notarize.ts
'

test_done 
