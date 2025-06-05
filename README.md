# Aqua JS CLI

JS Client scripts for signing, witnessing and verifying revisions

## Requirements
Minimum requirement: Node.js 14.x+  
But it is recommended to run the latest Node.js.  
Install node [here](https://nodejs.org/en/download)

## Getting Started 
1. `npm install`
2. `npm run build`
3. Use `aqua.js` in dist file, follow usage commands in the section below
4. You can also build a standalone binary using `build:bin`. Substitute accordingly in step 2 above; the binaries will be in the binaries folder

## Usage

### Credentials

By default, aqua.js will look for a credentials file at `~/.aqua/credentials.json`. If it doesn't exist, it will create one with the default values.

So you can run `./dist/aqua.js notarize README.md` without any arguments.

If you want to create a custom credentials file, you can use the `--cred` option:

```bash
./dist/aqua.js notarize README.md --cred ./NEW/PATH/TO/credentials.json
```

### 1. Notarizing / Signing / Witnessing a File

To notarize a file, use the following command:

```bash 
./dist/aqua.js notarize <FILE_PATH>
```

Example:

```bash 
./dist/aqua.js notarize ./LICENSE
```

To sign a file, use the following command.  
You can only sign aqua.json files. Ensure to notarize using the command above.

```bash
./dist/aqua.js notarize [--sign cli | --sign metamask | --sign did] <FILE_PATH>
```

Example:

```bash
./dist/aqua.js notarize --sign cli ./LICENSE
```

To witness a file, use the following command.  
You can only witness aqua.json files. Ensure to notarize using the command above.

```bash
./dist/aqua.js notarize [--witness eth | --witness nostr | --witness tsa] <FILE_PATH>
```

Example:

```bash
./dist/aqua.js notarize ./LICENSE --witness eth
```

To witness multiple aqua chains:

Example:
```bash
./dist/aqua.js notarize LICENSE,README.md --witness eth --vtree --network sepolia
```

To witness multiple files with specific revision:

Example:
```bash
./dist/aqua.js notarize LICENSE@0x_specific_revision_,README.md@0x_specific_revision_ --witness eth --type cli --vtree
```

### 2. Aqua Chain Verification

To verify an aqua chain, use the following command:

```bash
./dist/aqua.js verify <AQUA_CHAIN_FILE_PATH>
```

Example:

```bash
./dist/aqua.js verify LICENSE.aqua.json
```

#### 2.1. Verification Options

##### 2.1.1. `-v` - Outputting Verbose Results

Use the `-v` flag for result verboseness:

```bash
./dist/aqua.js verify LICENSE.aqua.json -v
```

##### 2.1.2. `--ignore-merkle-proof` - Ignore Verifying the Witness Merkle Proof of Each Revision

Use the `--ignore-merkle-proof` flag to ignore verifying merkle proof of each revision. Verification is faster:

```bash
./dist/aqua.js verify LICENSE.aqua.json --ignore-merkle-proof
```

### 3. Deleting a Revision from Aqua Chain

This will delete the last revision from an aqua chain:

```bash
./dist/aqua.js notarize --remove <FILE_PATH>
```

Example:

```bash
./dist/aqua.js notarize --remove ./LICENSE
```

### 4. Linking an Aqua Chain to Another

To link an Aqua chain to another, use the `--link` option as follows:

```bash
./dist/aqua.js notarize <FILE_PATH> --link <FILE_PATH.aqua.json>
```

Example:

```bash
./dist/aqua.js notarize --link ./LICENSE ./README.md.aqua.json
```

This will link `README.md.aqua.json` to the `LICENSE` file and it will be written into the `LICENSE.aqua.json` file.

### 5. Generating a Content Revision

To generate a `content` revision, run the following command:

```bash
./dist/aqua.js notarize --content ./LICENSE
```

### 6. Generating a Scalar Revision

To generate a `scalar` revision, run the following command:

```bash
./dist/aqua.js notarize --scalar ./LICENSE
```

### 7. Forms 

To create a genesis form revision:
```bash
./notarize.js example-form.json --form example-form.json
```

Please note: for genesis, the filename should be the same as the form name.

To create a form revision:
```bash
./notarize.js LICENSE --form example-form.json
```

### 8. Update Aqua Forms 

* To delete a form entry:
  ```bash
  ./form_updater.js example-form.json.aqua.json@abcd --delete age
  ```
 
* To update a form entry (i.e., undelete it):
  ```bash
  ./form_updater.js example-form.json.aqua.json --update forms_age 200
  ```

**Features:**

1. **File Validation**: Ensures the input file is a .aqua.json file and exists
2. **Form Key Detection**:
   - Can find exact matches (e.g., forms-name)
   - Can find partial matches (e.g., name will match forms-name)
   - Handles deleted fields (e.g., forms-name.deleted)
3. **Operations**:
   - `--delete`: Marks a form field as deleted by appending .deleted
   - `--update`: Updates or restores a form field, removing the .deleted suffix if present
4. **Error Handling**: Provides clear error messages for invalid inputs
5. **Non-destructive**: Preserves the original structure while making changes

## How to Run Tests

- Ensure to install sharness in your local system. The sharness path is set to `~/share/sharness/sharness.sh`, then copy the sharness directory to tests. Check out [sharness](https://github.com/felipec/sharness) for more instructions
- Run `make test`
- The output will be in test > trash *(the last part is dynamic based on the test)*
- **Hint**: Ensure your `tests/test-*.sh` files are executable: `chmod +x tests/test-*`