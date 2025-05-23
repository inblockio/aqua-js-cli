# data-accounting-external-verifier, 
JS Client,  scripts for signing , witnessiing and verifying revisiion <br/>

## Functional description
* configure remote domain (by default use localhost as domoain) to query REST API to verify page
* configure title name to select which page to verify


## Requirements
Minimum reuirement Node.js 14.x+ <br/>
But it is recommended to run the latest Node.js.
install node [here](https://nodejs.org/en/download)

## Getting started 
1. `npm install`
2. `npm run build`
3.  use `aqua.js in dist file` follow usage command. 
4.  You can also build a standalon binary using `build:bin`, subsittute 

## Usage
### 1. Notarizing / Signing / Witnessing a file

To notarize a file use the following command

```bash 
./aqua.js notarize <FILE_PATH>
```

ie 

```bash 
./aqua.js notarize ./LICENSE
```


To sign a file use the following command

```bash
./aqua.js notarize --sign [cli|metamask|did] <FILE_PATH>
```

ie 

```bash
./aqua.js  notarize  --sign cli ./LICENSE
```


To witness a file, use the following command

```bash
./aqua.js  notarize  [--witness eth|--witness nostr|--witness tsa] <FILE_PATH>
```

ie

```bash
./aqua.js  notarize ./LICENSE --witness eth
```

To witness multiple aqua chains 

ie 
```bash
./aqua.js notarize LICENSE,README.md --witness eth --vtree --type sepolia
```



To witness multiple file with specific revision 
ie 
```bash
./aqua.js notarize LICENSE@0x_specific_revision_,README.md@0x_specific_revision_ --witness eth  --type cli --vtree
```


### 2. Aqua chain verification

To verify an aqua chain use the following command

```bash
./aqua.js verify <AQUA_CHAIN_FILE_PATH>
```

ie

```bash
./aqua.js verify LICENSE.aqua.json
```

#### 2.1. Verification Options

##### 2.1.1. `-v` - Outputting verbose results

Use the `-v` for result versboseness ie

```bash
./aqua.js verify LICENSE.aqua.json -v
```

##### 2.1.2. `--ignore-merkle-proof` - Ignore verifying the witness merkle proof of each revision

Use the `--ignore-merkle-proof` for ignore verifying merkle proof of each revision. Verification is faster ie

```bash
./aqua.js verify LICENSE.aqua.json --ignore-merkle-proof
```

### 3. Deleting a revision from Aqua Chain

This will delete the last revision from an aqua chain

```bash
./aqua.js notarize --remove <FILE_PATH>
```

ie

```bash
./aqua.js  notarize --remove ./LICENSE
```


### 4. Linking an Aqua chain to another

To link an Aqua chain to another use the `--link` option as follows

```bash
./aqua.js notarize  <FILE_PATH>  --link  <FILE_PATH.aqua.json>
```

ie

```bash
./aqua.js notarize   --link ./LICENSE ./README.md.aqua.json
```

This will link `README.md.aqua.json` to `LICENSE` file and it will be written into `LICENSE.aqua.json` file


### 5. Generating a content revision

To generate a `content` revision you run the following command

```bash
./aqua.js notarize --content ./LICENSE
```

### 6. Generating a Scalar revision

To generate a `content` revision you run the following command


```bash
./aqua.js notarize --scalar ./LICENSE
```

### 7.  Forms 
To create a genesis form revision 
`./notarize.js example-form.json --form example-form.json `

please note for genesis the filane name should be the same with form name

To create a form revision 
`./notarize.js LICENCE --form example-form.json `

### 8. Update Aqua forms 

* To delete a form entry  `./form_updater.js example-form.json.aqua.json@abcd --delete age`
 
*  to update a form entry ie undelete it `./form_updater.js example-form.json.aqua.json --update forms_age 200`
 

1. File Validation: Ensures the input file is a .aqua.json file and exists
2. Form Key Detection:
Can find exact matches (e.g., forms-name)
Can find partial matches (e.g., name will match forms-name)
Handles deleted fields (e.g., forms-name.deleted)
3. Operations:
--delete: Marks a form field as deleted by appending .deleted
--update: Updates or restores a form field, removing the .deleted suffix if present
4. Error Handling: Provides clear error messages for invalid inputs
5. Non-destructive: Preserves the original structure while making changes

## How to run tests
- ensure to install shareness in you local systems the sharenss path is set to `~/share/sharness/sharness.sh` then copy the shareness directory to tests. Check out [sharness](https://github.com/felipec/sharness) for more instructions
- run `make test`
- the output will be  in test >  trash *(the last part is dynamic based on the test)
- Hint : ensure your `tests/test-*.sh` file are excutable `chmod +x  tests/test-*`




Here’s a more polished version with a clear and structured documentation style:  

---
