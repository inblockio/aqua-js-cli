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
    cp repo/formatter.ts formatter.ts
    cp repo/index.ts index.ts
'

test_expect_success 'Check README.md'  '
    test -f README.md
'

test_expect_success 'Create AQUA file for README.md' '
    $notarize README.md &&
    test -f README.md.aqua.json
'

test_expect_success 'Witness README.md' '
    $notarize README.md  --witness nostr &&
    test -f README.md.aqua.json
'

test_expect_success 'Verify witnessed README.md' '
    $verify README.md
'

test_expect_success 'Remove revision from README.md' '
    $notarize README.md --rm
'

test_expect_success 'Check notarize.ts'  '
    test -f notarize.ts
'

test_expect_success 'Create AQUA file for notarize.ts' '
    $notarize notarize.ts &&
    test -f notarize.ts.aqua.json
'

test_expect_success 'Witness notarize.ts TSA' '
    $notarize notarize.ts --witness tsa &&
    test -f notarize.ts.aqua.json
'

test_expect_success 'Verify notarize.ts' '
    $verify notarize.ts
'

test_expect_success 'Check LICENSE'  '
    test -f LICENSE
'

test_expect_success 'Create AQUA file for LICENSE' '
    $notarize LICENSE &&
    test -f LICENSE.aqua.json
'

test_expect_success 'Create AQUA file for formatter.ts' '
    $notarize formatter.ts &&
    test -f formatter.ts.aqua.json
'

test_expect_success 'Create AQUA file for README.md' '
    $notarize README.md &&
    test -f README.md.aqua.json
'

test_expect_success 'Witness LICENSE' '
    $notarize README.md,LICENSE,formatter.ts --witness eth --type cli &&
    test -f LICENSE.aqua.json
'

test_expect_success 'Verify witnessed LICENSE ' '
    $verify LICENSE
'

# test_expect_success 'Verify witnessed index.ts' '
#     $verify README.md
# '

test_expect_success 'Verify witnessed formatter.ts' '
    $verify formatter.ts
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
